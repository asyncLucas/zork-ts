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
import { Logger } from "tslog";
import type { Message } from 'telegraf/types';
import LocalSession from 'telegraf-session-local';
import { Telegraf, Telegram, Markup } from 'telegraf';

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
	private readonly logger = new Logger({ name: "main", type: "pretty" });


	private iterator = this.chaptersGenerator();

	static readonly run = () => new Main().initialize();

	private initialize(): void {
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
				this.logger.info(`New user started the bot: ${ctx.from?.username} '${ctx.from?.id}'`);
				this.mission(ctx);
				await this.languageSelection(ctx);
			} catch (error) {
				this.logger.error(`Error in /start command for user: ${ctx.from?.username} '${ctx.from?.id}'`, error);
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
		ctx.session = {
			answer: '',
			language,
			currentChapter: ctx?.session?.currentChapter,
			translation: this.getTranslation(language),
			items: ctx?.session?.items ?? []
		};
		this.currentChapter(ctx);
		this.logger.info(`User changed language to '${language}': ${ctx.from?.username} '${ctx.from?.id}'`);
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
			this.logger.info(`User advanced to chapter '${currentPart}': ${ctx.from?.username} '${ctx.from?.id}'`);
			return;
		}

		this.logger.info(`User completed the game: ${ctx.from?.username} '${ctx.from?.id}'`);
		this.gameCompleted(ctx, ctx.session?.translation?.message?.['Game Completed']);
	}

	private currentChapter(ctx: ZorkContext): void {
		ctx.reply(ctx.session?.translation?.message?.[ctx.session.currentChapter] || '');
		setTimeout(() => ctx.reply(ctx.session?.translation?.message?.['What do you do? '] || ''), 500);
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
		this.logger.info(`User reached game completed state: ${ctx.from?.username} '${ctx.from?.id}'`);
	}

	private *chaptersGenerator(): Generator<Part, Part, undefined> {
		return yield* [Part.I, Part.II, Part.III, Part.IV, Part.V, Part.VI, Part.VII, Part.VIII, Part.IX, Part.X, Part.XI, Part.XII, Part.XIII, Part.XIV, Part.XV];
	}

	private usefulCommands(): void {
		this.bot.help(ctx => {
			ctx.reply('🏁 Send /start to start the game');
			ctx.reply('⌛ Send /restart to restart the game');
			ctx.reply('🌐 Send /language select a new idiom');
			ctx.reply('📖 Send /chapter to get the current chapter description');
			ctx.reply('🎒 Send /items to check your collected items');
			ctx.reply('ℹ️ Send /info to get info about the game');
		});

		this.bot.command('restart', ctx => this.validateSession(ctx, this.restart));

		this.bot.command('language', ctx => this.languageSelection(ctx));

		this.bot.command('chapter', ctx => this.validateSession(ctx, this.currentChapter));

		this.bot.command('items', ctx => this.validateSession(ctx, this.showItems.bind(this)));

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
		try {
			this.resetState(ctx);
			this.mission(ctx);
			this.currentChapter(ctx);
			this.logger.info(`User restarted the game: ${ctx.from?.username} '${ctx.from?.id}'`);
		} catch (error) {
			this.startBot();
			this.sendErrorMessage(error);
		}
	}

	private resetState(ctx: ZorkContext): void {
		this.iterator = this.chaptersGenerator();
		ctx.session.currentChapter = this.iterator.next().value;
		ctx.session.items = [];
		this.resetUserAttempts();
	}

	private showItems(ctx: ZorkContext): void {
		const items = ctx.session.items || [];
		const translation = ctx.session.translation;

		if (items.length === 0) {
			ctx.reply(translation.message['No Items'] || '🎒 Your inventory is empty.');
		} else {
			const itemList = items.map((item: string, index: number) => `${index + 1}. ${item}`).join('\n');
			ctx.reply(`${translation.message['Items List'] || '🎒 Your inventory:'}\n\n${itemList}`);
		}

		this.logger.info(`User checked items: ${ctx.from?.username} '${ctx.from?.id}' - Items: ${items.length}`);
	}

	private addItemToInventory(ctx: ZorkContext, item: string): void {
		if (!ctx.session.items) {
			ctx.session.items = [];
		}

		if (!ctx.session.items.includes(item)) {
			ctx.session.items.push(item);
			this.logger.info(`Item added to inventory: ${ctx.from?.username} '${ctx.from?.id}' - Item: '${item}'`);
		}
	}

	private userInput(): void {
		this.bot.on('message', ctx => {
			const answer = this.parseUserInput(ctx.text || '');
			ctx.session.answer = answer;

			const parsedCommand = commandParserService.parse(answer, ctx.session.translation);
			if (parsedCommand.action === 'take' && parsedCommand.object) {
				this.addItemToInventory(ctx, parsedCommand.object);
				ctx.reply(ctx.session.translation.message['TAKEN']?.replace('#item', parsedCommand.object) || `✅ Taken: ${parsedCommand.object}`);
			}

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
		this.logger.info(`Incorrect answer by user: ${ctx.from?.username} '${ctx.from?.id}' - Answer: '${incorrectAnswer}'`);
		this.increaseUserAttempts();

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

	private sendErrorMessage(error: any): void {
		this.logger.error('An unexpected error occurred:', error);
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

Main.run();
