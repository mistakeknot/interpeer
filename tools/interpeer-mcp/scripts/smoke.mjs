import { generateText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

async function main() {
  try {
    const result = await generateText({
      model: claudeCode(process.env.INTERPEER_CLAUDE_MODEL?.trim() || 'sonnet'),
      system: 'You are a concise assistant verifying Claude Code connectivity.',
      messages: [
        {
          role: 'user',
          content: 'Reply with a single short sentence confirming Claude Code access in this MCP smoke test.'
        }
      ]
    });

    console.log('Text:', result.text.trim());
    console.log('Usage:', result.usage ?? {});
  } catch (error) {
    console.error('Smoke test failed:', error);
    process.exitCode = 1;
  }
}

await main();
