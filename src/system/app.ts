#!/usr/bin/env node

/**
 * ZORK I: The Great Underground Empire
 * Copyright (c) 1981, 1982, 1983 Infocom, Inc. All rights reserved.
 * ZORK is a registered trademark of Infocom, Inc.
 * Revision 88 / Serial number 840726
 * Source at: https://web.mit.edu/marleigh/www/portfolio/Files/zork/transcript.html
 */

import {
	Reset,
	FgWhite,
	BgMagenta,
	HintsCount,
	DeadMessage,
	ConfirmOptions,
	GameOverOptions,
} from './constants';
import { Part } from '../models/Part';
import { line, input, alert, print, clear, danger, success, printLine } from './console';

const [, , lang] = process.argv;
const translation = require(`../assets/lang/zork-${lang ?? 'en'}.json`);
const { interactions, message, availableAnswers } = translation;

class Zork {
	private answer?: string;
	private readonly chapters = new Array(Part.I, Part.II, Part.III, Part.IV, Part.V);

	constructor() {
		this.showGreetings();
	}

	private showGreetings(): void {
		line(BgMagenta, FgWhite);
		print(message['Welcome to Zork - The Unofficial TypeScript Version.']);
		line();
		print(Reset);
	}

	public async play(): Promise<void> {
		for (let currentPart of this.chapters) {
			let remainingAttemptsForHint = HintsCount;

			while (!this.correctAnswer(currentPart)) {
				printLine(message[currentPart]);

				// TODO: Show a tip after trying a couple of times (count/if)
				if (remainingAttemptsForHint-- == 0) {
					print('hint');
				}

				this.answer = (await input(message['What do you do? '])).toLocaleLowerCase();

				const isGameOver = GameOverOptions.includes(this.answer);

				if (isGameOver) {
					danger(message[DeadMessage]);
					await this.askToLeave();
				}

				if (interactions[currentPart][this.answer]) {
					success(interactions[currentPart][this.answer]);
				} else if (!this.correctAnswer(currentPart)) {
					alert(message["Keep trying, your answer still doesn't fit the story..."]);
				}
			}

			this.clearAnswer();
		}

		await this.askToLeave();
	}

	private readonly correctAnswer = (chapter: Part): boolean =>
		availableAnswers[chapter].includes(this.answer);

	private readonly clearAnswer = (): void => (this.answer = undefined);

	private async askToLeave(): Promise<void> {
		const confirm = await input(message['Do you want to continue? (Y/N) ']);

		if (ConfirmOptions.includes(confirm)) {
			clear();
			await this.play();
		} else {
			process.exit();
		}
	}
}

(async () => {
	try {
		await new Zork().play();
	} catch (error) {
		danger(error);
	}
})();
