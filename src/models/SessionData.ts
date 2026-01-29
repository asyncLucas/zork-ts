import { Part } from './Part';
import { TranslationData } from './TranslationData';

export interface SessionData {
	answer: string;
	language: string;
	currentChapter: Part;
	translation: TranslationData;
	items: string[];
}
