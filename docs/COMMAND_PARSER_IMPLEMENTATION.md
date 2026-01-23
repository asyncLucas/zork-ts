# Command Parser Implementation

## Overview

This implementation combines **pattern matching**, **similarity fallback**, and a **shared command database** to eliminate duplication in answer validation across both English and Portuguese translations.

## What Changed

### 1. **New Command Parser Service**

Created [`command-parser.service.ts`](../src/services/command-parser.service.ts) that:

- Parses user input into structured commands (action + object/direction)
- Matches commands using regex patterns
- Falls back to similarity matching when exact/pattern match fails
- Provides canonical answers for hint calculation
- Supports both new and legacy JSON structures

### 2. **Updated Translation Data Model**

Enhanced [`TranslationData.ts`](../src/models/TranslationData.ts) with:

```typescript
interface TranslationData {
  commands?: {
    navigation?: NavigationCommand;
    actions?: Record<string, ActionCommand>;
  };
  chapterRequirements?: Record<Part, ChapterRequirement>;
  // ... existing fields
}
```

### 3. **Refactored JSON Files**

#### Before (Duplicated):

```json
"availableAnswers": {
  "I": ["go south"],
  "II": ["go east"],
  "III": ["descend staircase", "go down staircase", "scale staircase"],
  "IV": ["descend staircase", "go down staircase", "scale staircase"]
}
```

#### After (DRY):

```json
"commands": {
  "navigation": {
    "patterns": ["^(go|move|walk)\\s+(?<direction>\\w+)"],
    "synonyms": {
      "south": ["s"],
      "east": ["e"]
    }
  },
  "actions": {
    "descend": {
      "pattern": "^(descend|go down|scale)",
      "objects": ["staircase", "stairs"]
    }
  }
},
"chapterRequirements": {
  "I": { "type": "navigation", "direction": "south" },
  "III": { "type": "action", "action": "descend", "object": "staircase" },
  "IV": { "type": "action", "action": "descend", "object": "staircase" }
}
```

### 4. **Updated Main Logic**

Modified [`main.ts`](../src/main.ts) to:

- Use `commandParserService.isCorrectAnswer()` instead of simple array lookup
- Return confidence scores for fuzzy matching
- Pass confidence to hint generation

### 5. **Configuration**

Added `answerSimilarityThreshold` to [`configuration.service.ts`](../src/services/configuration.service.ts):

- Default: 0.75 (75% similarity required)
- Configurable via `ANSWER_SIMILARITY_THRESHOLD` environment variable

## Benefits

### ✅ Eliminated Duplication

- **Before**: 5 variations of "descend staircase" in Portuguese
- **After**: 1 pattern that matches all variations

### ✅ More Flexible

- Accepts "go to the south", "move south", "walk s"
- Tolerates typos (75% similarity threshold)
- Language-specific synonyms (e.g., "ir", "va", "vou" in Portuguese)

### ✅ Easier to Maintain

- Add new commands in one place
- Shared vocabulary across chapters
- Clear separation of concerns

### ✅ Better UX

- More forgiving to player input
- Confidence-based hints
- Natural language understanding

## How It Works

### 3-Layer Matching Strategy:

1. **Exact Pattern Match** (Confidence: 1.0)
   - User input matches regex pattern exactly
   - Example: "go south" → navigation pattern

2. **Pattern with Variations** (Confidence: 0.9)
   - Synonyms and variations accepted
   - Example: "ir para o sul" → Portuguese navigation

3. **Similarity Fallback** (Confidence: 0.0-1.0)
   - Levenshtein distance calculation
   - Example: "goo south" → 90% similar to "go south"

### Command Parsing Flow:

```
User Input: "vou para o leste"
    ↓
Normalize: "vou para o leste"
    ↓
Pattern Match: navigation pattern
    ↓
Extract Direction: "leste"
    ↓
Resolve Synonym: "leste" → "leste" (canonical)
    ↓
Check Requirement: Chapter II needs direction="leste"
    ↓
Result: ✅ Matched (confidence: 1.0, method: 'exact')
```

## Example Improvements

### Portuguese Chapter III & IV

**Before** (duplicated):

```json
"III": ["desco as escadas", "descer escada", "descer as escadas",
        "desca as escadas", "desco pelas escadas", "desco a escada"],
"IV": ["desco as escadas", "descer escada", "descer as escadas",
        "desca as escadas", "desco pelas escadas", "desco a escada"]
```

**After** (single source):

```json
"actions": {
  "descend": {
    "pattern": "^(descer|desco|desca)",
    "objects": ["escadas", "escada"]
  }
},
"chapterRequirements": {
  "III": { "type": "action", "action": "descend", "object": "escadas" },
  "IV": { "type": "action", "action": "descend", "object": "escadas" }
}
```

Now accepts: "desco", "descer escada", "desca as escadas", "baixar escadas", etc.

## Migration Path

The system is **backward compatible**:

- Old `availableAnswers` arrays still work
- New `chapterRequirements` take precedence
- Gradual migration supported

## Testing Recommendations

Test various input formats:

- ✅ `go south` / `ir para o sul`
- ✅ `move s` / `vou para s`
- ✅ `walk to the south` / `caminhar para o sul`
- ✅ `descend staircase` / `desco escadas`
- ✅ `go down stairs` / `descer a escada`
- ✅ Typos: `goo south` (should give high similarity hint)

## Future Enhancements

1. **More Languages**: Easy to add Spanish, French, etc.
2. **More Commands**: Add "take", "examine", "inventory"
3. **Context-Aware Parsing**: Objects in current room only
4. **Command History**: Learn from player patterns
5. **AI Integration**: Use LLM for natural language understanding
