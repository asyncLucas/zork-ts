#!/usr/bin/env node

/**
 * Command Parser Service
 * Parses user input into structured commands using pattern matching
 * and identifies intent (action, direction, object)
 */

import { ILogObj, Logger } from 'tslog';

import { Part } from '../models/Part';
import similarityService from './similarity.service';
import { TranslationData } from '../models/TranslationData';

export interface ParsedCommand {
  action?: string;
  direction?: string;
  object?: string;
  raw: string;
}

export interface CommandMatch {
  matched: boolean;
  confidence: number;
  method: 'exact' | 'pattern' | 'similarity';
}

class CommandParserService {
  private readonly SIMILARITY_THRESHOLD = 0.85;
  private readonly logger: Logger<ILogObj> = new Logger();

  /**
   * Parse user input into structured command
   */
  public parse(input: string, translation: TranslationData): ParsedCommand {
    const normalized = this.normalizeInput(input);
    const commands = translation.commands;

    // Try to match navigation commands
    if (commands?.navigation) {
      for (const pattern of commands.navigation.patterns || []) {
        const regex = new RegExp(pattern, 'i');
        const match = regex.exec(normalized);
        if (match?.groups?.direction) {
          return {
            action: 'navigate',
            direction: this.resolveDirection(match.groups.direction, commands.navigation.synonyms),
            raw: normalized,
          };
        }
      }
    }

    if (commands?.actions) {
      for (const [actionName, actionConfig] of Object.entries(commands.actions)) {
        const regex = new RegExp(actionConfig.pattern, 'i');
        const match = regex.exec(normalized);
        if (match) {
          const object = this.extractObject(normalized, actionConfig.objects || []);
          return {
            action: actionName,
            object,
            raw: normalized,
          };
        }
      }
    }

    return { raw: normalized };
  }

  /**
   * Check if user's answer matches the required answer for current chapter
   */
  public isCorrectAnswer(
    userAnswer: string,
    currentChapter: Part,
    translation: TranslationData
  ): CommandMatch {
    const normalizedAnswer = this.normalizeInput(userAnswer);
    const requirement = translation.chapterRequirements?.[currentChapter];

    if (!requirement) {
      this.logger.debug(`No chapter requirement found for chapter ${currentChapter}, falling back to legacy answer check.`);
      return this.checkLegacyAnswer(normalizedAnswer, currentChapter, translation);
    }

    const parsedCommand = this.parse(userAnswer, translation);
    if (this.matchesRequirement(parsedCommand, requirement)) {
      this.logger.debug(`User answer matches chapter ${currentChapter} requirement exactly.`);
      return {
        matched: true,
        confidence: 1,
        method: 'exact',
      };
    }

    const patternMatch = this.tryPatternMatch(normalizedAnswer, requirement, translation);
    if (patternMatch.matched) {
      this.logger.debug(`User answer matches chapter ${currentChapter} requirement by pattern.`);
      return patternMatch;
    }

    this.logger.debug(`User answer does not match chapter ${currentChapter} requirement exactly or by pattern, trying similarity match.`);
    return this.trySimilarityMatch(normalizedAnswer, currentChapter, translation);
  }

  /**
   * Get the canonical answer for a chapter (for hint calculation)
   */
  public getCanonicalAnswer(currentChapter: Part, translation: TranslationData): string {
    const requirement = translation.chapterRequirements?.[currentChapter];

    if (!requirement) {
      this.logger.debug(`No chapter requirement found for chapter ${currentChapter}, falling back to legacy answer check.`);
      const answers = translation.availableAnswers?.[currentChapter];
      return Array.isArray(answers) ? answers[0] : answers || '';
    }

    // Build canonical answer from requirement
    if (requirement.type === 'navigation') {
      return `go ${requirement.direction}`;
    } else if (requirement.type === 'action') {
      return requirement.object ? `${requirement.action} ${requirement.object}` : (requirement.action || '');
    }

    return '';
  }

  private normalizeInput(input: string): string {
    return input
      .normalize('NFD')
      .replaceAll(/[\u0300-\u036f]/g, '')
      .replaceAll(/[^a-zA-Z ]/g, '')
      .toLowerCase()
      .trim();
  }

  private resolveDirection(direction: string, synonyms: Record<string, string[]> = {}): string {
    direction = direction.toLowerCase();

    for (const [canonical, variations] of Object.entries(synonyms)) {
      if (variations.includes(direction) || canonical === direction) {
        this.logger.debug(`Resolved direction '${direction}' to canonical '${canonical}'`);
        return canonical;
      }
    }

    return direction;
  }

  private extractObject(text: string, validObjects: string[]): string | undefined {
    for (const obj of validObjects) {
      if (text.includes(obj.toLowerCase())) {
        this.logger.debug(`Extracted object '${obj}' from text.`);
        return obj;
      }
    }
    return undefined;
  }

  private matchesRequirement(command: ParsedCommand, requirement: any): boolean {
    if (requirement.type === 'navigation') {
      return command.action === 'navigate' && command.direction === requirement.direction;
    } else if (requirement.type === 'action') {
      const actionMatches = command.action === requirement.action;
      const objectMatches = !requirement.object || command.object === requirement.object;
      return actionMatches && objectMatches;
    }
    return false;
  }

  private tryPatternMatch(
    answer: string,
    requirement: any,
    translation: TranslationData
  ): CommandMatch {
    const patterns: string[] = [];

    if (requirement.type === 'navigation') {
      const navPatterns = translation.commands?.navigation?.patterns || [];
      patterns.push(...navPatterns);
    } else if (requirement.type === 'action') {
      const actionConfig = translation.commands?.actions?.[requirement.action];
      if (actionConfig?.pattern) {
        patterns.push(actionConfig.pattern);
      }
    }

    for (const pattern of patterns) {
      if (new RegExp(pattern, 'i').test(answer)) {
        this.logger.debug(`User answer matches pattern '${pattern}'.`);
        return {
          matched: true,
          confidence: 0.9,
          method: 'pattern',
        };
      }
    }

    this.logger.debug(`No patterns matched for the user's answer.`);
    return { matched: false, confidence: 0, method: 'pattern' };
  }

  private trySimilarityMatch(
    answer: string,
    currentChapter: Part,
    translation: TranslationData
  ): CommandMatch {
    const canonicalAnswer = this.getCanonicalAnswer(currentChapter, translation);
    const similarity = similarityService.calculate(canonicalAnswer, answer);

    this.logger.debug(`Similarity between user answer and canonical answer for chapter ${currentChapter}: ${similarity}`);
    return {
      matched: similarity >= this.SIMILARITY_THRESHOLD,
      confidence: similarity,
      method: 'similarity',
    };
  }

  private checkLegacyAnswer(
    answer: string,
    currentChapter: Part,
    translation: TranslationData
  ): CommandMatch {
    const availableAnswers = translation.availableAnswers?.[currentChapter];

    if (!availableAnswers) {
      this.logger.debug(`No available answers found for chapter ${currentChapter}.`);
      return { matched: false, confidence: 0, method: 'exact' };
    }

    const answers = Array.isArray(availableAnswers) ? availableAnswers : [availableAnswers];
    if (answers.includes(answer)) {
      this.logger.debug(`User answer matches legacy answer for chapter ${currentChapter} exactly.`);
      return { matched: true, confidence: 1, method: 'exact' };
    }

    // Check similarity with first answer
    const similarity = similarityService.calculate(answers[0], answer);
    this.logger.debug(`Legacy answer similarity for chapter ${currentChapter}: ${similarity}`);
    return {
      matched: similarity >= this.SIMILARITY_THRESHOLD,
      confidence: similarity,
      method: 'similarity',
    };
  }
}

export default new CommandParserService();
