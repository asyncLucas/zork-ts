import { Part } from './Part';

export interface NavigationCommand {
	patterns: string[];
	synonyms: Record<string, string[]>;
}

export interface ActionCommand {
	pattern: string;
	objects?: string[];
}

export interface ChapterRequirement {
	type: 'navigation' | 'action';
	direction?: string;
	action?: string;
	object?: string;
}

export interface TranslationData {
	info: string;
	interactions: any;
	message: any;
	availableAnswers?: any; // Kept for backward compatibility
	commands?: {
		navigation?: NavigationCommand;
		actions?: Record<string, ActionCommand>;
	};
	chapterRequirements?: Record<Part, ChapterRequirement>;
}
