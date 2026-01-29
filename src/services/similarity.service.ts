#!/usr/bin/env node

/**
 * The Levenshtein distance is a string metric for measuring the difference between two sequences.
 * It is the minimum number of single-character edits required to change one word into the other.
 * https://en.wikipedia.org/wiki/Levenshtein_distance
 */

class SimilarityService {
	public calculate(sequence1 = '', sequence2 = ''): number {
		let longer: string;
		let shorter: string;

		if (sequence1.length < sequence2.length) {
			longer = sequence2;
			shorter = sequence1;
		} else {
			longer = sequence1;
			shorter = sequence2;
		}

		const longerLength = longer.length;
		if (longerLength == 0) {
			return 1;
		}

		return (longerLength - this.calculateLevenshteinDistance(longer, shorter)) / longerLength;
	}

	private calculateLevenshteinDistance(sequence1: string, sequence2: string): number {
		sequence1 = sequence1.toLowerCase();
		sequence2 = sequence2.toLowerCase();

		let costs: number[] = new Array();

		for (let i = 0; i <= sequence1.length; i++) {
			let lastValue = i;

			for (let j = 0; j <= sequence2.length; j++) {
				if (i == 0) {
					costs[j] = j;
				} else if (j > 0) {
					let newValue = costs[j - 1];

					if (sequence1.charAt(i - 1) != sequence2.charAt(j - 1)) {
						newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
					}

					costs[j - 1] = lastValue;
					lastValue = newValue;
				}
			}

			if (i > 0) {
				costs[sequence2.length] = lastValue;
			}
		}

		return costs[sequence2.length];
	}
}

export default new SimilarityService();
