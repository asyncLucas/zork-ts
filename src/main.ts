#!/usr/bin/env node

/**
 * ZORK I: The Great Underground Empire
 * Copyright (c) 1981, 1982, 1983 Infocom, Inc. All rights reserved.
 * ZORK is a registered trademark of Infocom, Inc.
 * Revision 88 / Serial number 840726
 * Source at: https://web.mit.edu/marleigh/www/portfolio/Files/zork/transcript.html
 */

import 'dotenv/config';
import fs from 'node:fs';
import LocalSession from 'telegraf-session-local';
import { Telegraf, Telegram, Markup } from 'telegraf';
import type { Message } from 'telegraf/types';

import { Part } from './models/Part';
import { ZorkContext } from './models/ZorkContext';
import { TranslationData } from './models/TranslationData';
import similarityService from './services/similarity.service';
import configurationService from './services/configuration.service';
import commandParserService from './services/command-parser.service';

class Main {
	private userAttempts: number;
	private telegram: Telegram;
	private bot: Telegraf<ZorkContext>;

	private iterator = this.chaptersGenerator();

	public initialize(): void {
		try {
			this.createInstances();
			this.initializeSession();
			this.startBot();
			this.observableActions();
			this.usefulCommands();
			this.userInput();
			this.launchBot();
			this.listeners();
		} catch (error) {
			this.sendErrorMessage(error);
		}
	}

	private createInstances(): void {
		this.resetUserAttempts();
		this.telegram = new Telegram(configurationService.token);
		this.bot = new Telegraf<ZorkContext>(configurationService.token);
	}

	private increaseUserAttempts(): void {
		this.userAttempts++;
	}

	private resetUserAttempts(): void {
		this.userAttempts = 0;
	}

	private get remainingUserAttempts(): number {
		return configurationService.userMaximumAttempts - this.userAttempts;
	}

	private get maximumAttemptsReachedByTheUser(): boolean {
		return this.remainingUserAttempts <= 1;
	}

	private initializeSession(): void {
		this.bot.use(new LocalSession().middleware());
	}

	private async startBot(): Promise<void> {
		this.bot.start(async ctx => {
			try {
				this.mission(ctx);
				await this.languageSelection(ctx);
			} catch (error) {
				this.sendErrorMessage(error);
			}
		});
	}

	private async mission(ctx: ZorkContext): Promise<void> {
		await ctx.reply(
			`Hi 👋, ${ctx?.from?.first_name}!
			\n🎈 Welcome to Zork - The Unofficial TypeScript Version. 🎈
			\n👉 Your mission is to find the Jade Statue 🏆 \n`
		);
	}

	private async languageSelection(ctx: ZorkContext): Promise<Message.TextMessage> {
		return await ctx.reply(
			`👉 Please select your language.\n(For available commands press /help)`,
			Markup.keyboard(['🇧🇷 PT-BR', '🇺🇸 EN-US']).oneTime(true).resize()
		);
	}

	private observableActions(): void {
		this.bot.hears('🇧🇷 PT-BR', ctx => this.changeLanguage(ctx, 'pt'));
		this.bot.hears('🇺🇸 EN-US', ctx => this.changeLanguage(ctx, 'en'));
		this.bot.hears('Play Again', ctx => this.restart(ctx));
	}

	private changeLanguage(ctx: ZorkContext, language: string): void {
		const translation = this.getTranslation(language);
		const currentChapter = ctx?.session?.currentChapter ?? this.iterator.next().value;
		ctx.session = { answer: '', currentChapter, translation, language };
		this.currentChapter(ctx);
	}

	private getTranslation(language: string): TranslationData {
		const translationFilePath = `${process.cwd()}/src/assets/lang/zork-${language}.json`;
		const translationJSON = fs.readFileSync(translationFilePath, {
			encoding: 'utf-8',
		});
		return JSON.parse(translationJSON);
	}

	private nextChapter(ctx: ZorkContext): void {
		const { done, value: currentPart } = this.iterator.next();

		if (!done) {
			ctx.session.currentChapter = currentPart;
			this.currentChapter(ctx);
			return;
		}

		this.gameCompleted(ctx, ctx.session.translation.message['Game Completed']);
	}

	private currentChapter(ctx: ZorkContext): void {
		ctx.reply(ctx.session.translation.message[ctx.session.currentChapter]);
		setTimeout(() => ctx.reply(ctx.session.translation.message['What do you do? ']), 500);
	}

	private gameCompleted(ctx: ZorkContext, message: string): void {
		this.resetState(ctx);
		ctx.replyWithPhoto(configurationService.mapURI);
		ctx.reply(
			message,
			Markup.keyboard([['Play Again']])
				.oneTime()
				.resize()
		);
	}

	private *chaptersGenerator(): Generator<Part, void, undefined> {
		yield* [Part.I, Part.II, Part.III, Part.IV, Part.V, Part.VI, Part.VII, Part.VIII, Part.IX, Part.X, Part.XI, Part.XII, Part.XIII, Part.XIV, Part.XV];
	}

	private usefulCommands(): void {
		this.bot.help(ctx => {
			ctx.reply('🏁 Send /start to start the game');
			ctx.reply('⌛ Send /restart to restart the game');
			ctx.reply('🌐 Send /language select a new idiom');
			ctx.reply('📖 Send /chapter to get the current chapter description');
			ctx.reply('ℹ️ Send /info to get info about the game');
		});

		this.bot.command('restart', ctx => this.validateSession(ctx, this.restart));

		this.bot.command('language', ctx => this.languageSelection(ctx));

		this.bot.command('chapter', ctx => this.validateSession(ctx, this.currentChapter));

		this.bot.command('info', ctx => {
			ctx.reply(`Hi 👋, ${ctx.from.first_name}! Here are some important infos.`, {
				reply_markup: {
					inline_keyboard: [
						[{ text: 'How to contribute', url: configurationService.homePageURL }],
					],
				},
			});
		});
	}

	private validateSession(ctx: ZorkContext, callback: Function): void {
		if (ctx.session?.translation) {
			callback(ctx);
		} else {
			ctx.reply('You must select a /language first! Please, check your menu options.');
		}
	}

	private restart(ctx: ZorkContext): void {
		this.resetState(ctx);
		this.mission(ctx);
		this.currentChapter(ctx);
	}

	private resetState(ctx: ZorkContext): void {
		this.iterator = this.chaptersGenerator();
		ctx.session.currentChapter = this.iterator.next().value as Part;
		this.resetUserAttempts();
	}

	private userInput(): void {
		this.bot.on('message', ctx => {
			const answer = this.parseUserInput(ctx.text || '');
			ctx.session.answer = answer;

			// Check if user's answer is correct using new command parser
			const answerResult = commandParserService.isCorrectAnswer(
				answer,
				ctx.session.currentChapter,
				ctx.session.translation
			);

			if (answerResult.matched) {
				this.resetUserAttempts();
				this.nextChapter(ctx);
				return;
			}

			// Check for specific interactions
			const correctInteration =
				ctx.session?.translation?.interactions?.[ctx.session?.currentChapter]?.[answer];

			if (correctInteration) {
				ctx.reply(correctInteration);
			} else if (this.maximumAttemptsReachedByTheUser) {
				this.gameCompleted(ctx, ctx.session.translation.message['Game Over']);
			} else {
				this.incorrectAnswer(ctx, answer, answerResult.confidence);
			}
		});
	}

	private incorrectAnswer(ctx: ZorkContext, incorrectAnswer: string, confidence?: number): void {
		this.increaseUserAttempts();

		// Use provided confidence or calculate it
		let percent: string;
		if (confidence === undefined) {
			const canonicalAnswer = commandParserService.getCanonicalAnswer(
				ctx.session.currentChapter,
				ctx.session.translation
			);
			percent = (
				similarityService.calculate(canonicalAnswer, incorrectAnswer) * 100
			).toFixed(2);
		} else {
			percent = (confidence * 100).toFixed(2);
		}

		ctx.reply(
			ctx.session.translation.message['Try again']
				.replace('#percent', percent)
				.replace('#attempts', this.remainingUserAttempts.toString())
		);
	}

	private parseUserInput(text: string): string {
		return text
			.normalize('NFD')
			.replaceAll(/[\u0300-\u036f]/g, '')
			.replaceAll(/[^a-zA-Z ]/g, '')
			.toLowerCase()
			.trim();
	}

	private launchBot(): void {
		this.bot.launch();
	}

	// @deprecated -- to be removed in future versions
	private correctAnswer(ctx: ZorkContext, answer: string): boolean {
		// This method is deprecated in favor of commandParserService.isCorrectAnswer
		// Kept for backward compatibility
		const result = commandParserService.isCorrectAnswer(
			answer,
			ctx.session.currentChapter,
			ctx.session.translation
		);
		return result.matched;
	}

	private sendErrorMessage(error: any): void {
		console.log(error);

		if (configurationService.chatId) {
			this.telegram.sendMessage(
				configurationService.chatId,
				JSON.stringify(error, null, 2)
			);
		}
	}

	private listeners(): void {
		process.once('SIGINT', () => this.bot.stop('SIGINT'));
		process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
	}
}

new Main().initialize();
