class ConfigurationService {
	public get token(): string {
		return process.env.BOT_TOKEN;
	}

	public get mapURI(): string {
		return process.env.MAP_URI;
	}

	public get chatId(): string {
		return process.env.CHAT_ID;
	}

	public get homePageURL(): string {
		return process.env.HOME_PAGE;
	}

	public get userMaximumAttempts(): number {
		return Number.parseInt(process.env.USER_MAXIMUM_ATTEMPTS ?? '5') ?? 5;
	}

	public get answerSimilarityThreshold(): number {
		return Number.parseFloat(process.env.ANSWER_SIMILARITY_THRESHOLD ?? '0.85') ?? 0.85;
	}
}

export default new ConfigurationService();
