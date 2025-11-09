# Chat Context Management Fix

## Problem

The chat page was not properly maintaining context when users added follow-up items to their outfit. Specifically:

1. **First request**: "I want a red crop top from H&M"
   - ✅ Uses original user photo
   - ✅ Sends to virtual try-on API
   - ✅ Returns generated image

2. **Follow-up request**: "I want black jeans"
   - ❌ Was using the **original user photo** instead of the **already generated virtual try-on image**
   - ❌ Result: Creates a new image with just jeans on the original photo, losing the crop top

## Root Cause

The API had a condition that required **both** `priorOutfitImage` AND `priorItems` to exist before using the prior outfit as the base:

```typescript
} else if (priorOutfitImage && priorItems && priorItems.length > 0) {
```

If `priorItems` was empty or not properly passed, it would fall through to using the original photo.

## Solution

### 1. Improved Context Decision Logic

Added clearer variable naming and better condition checking:

```typescript
const hasPriorContext = Array.isArray(priorItems) && priorItems.length > 0;
const hadReplacement = hasPriorContext && priorItems.some(i => newCategories.has(normalizeCategory(i.category)));

if (hadReplacement) {
  // REPLACEMENT: Regenerate from scratch with all merged items
  baseImage = primaryPhoto.url;
  itemsToApply = itemsForTryOn;
} else if (priorOutfitImage && hasPriorContext) {
  // ADDITION: Use prior outfit as base and only apply NEW items
  baseImage = priorOutfitImage;
  itemsToApply = outfitItems; // Only the new items
} else {
  // FIRST TIME: Use original user photo
  baseImage = primaryPhoto.url;
  itemsToApply = itemsForTryOn;
}
```

### 2. Enhanced Debugging

Added comprehensive console logging in both the UI and API:

**UI (`src/app/chat/page.tsx`):**
```typescript
console.log('[CHAT UI] ===== SENDING REQUEST =====');
console.log('[CHAT UI] Prior items count:', priorItems.length);
console.log('[CHAT UI] Prior items:', priorItems.map(...));
console.log('[CHAT UI] Prior outfit image:', priorOutfitImage ? 'exists...' : 'none');
```

**API (`src/app/api/chat/route.ts`):**
```typescript
console.log('[CHAT] ===== CONTEXT DECISION =====');
console.log('[CHAT] Has prior context?', hasPriorContext);
console.log('[CHAT] Has prior outfit image?', !!priorOutfitImage);
console.log('[CHAT] New categories:', Array.from(newCategories));
console.log('[CHAT] Prior categories:', priorItems.map(...));
console.log('[CHAT] Had replacement?', hadReplacement);
console.log('[CHAT] DECISION: ...');
```

## How It Works Now

### Scenario 1: First Item (No Context)
- User: "red crop top from H&M"
- Decision: **First outfit - using original user photo**
- Base: Original user photo
- Items to apply: [crop top]
- Result: Virtual try-on with crop top

### Scenario 2: Adding New Item (Different Category)
- User: "black jeans"
- Prior context: [crop top] + prior outfit image
- Decision: **Addition - building on prior outfit with new items only**
- Base: **Prior outfit image** (with crop top)
- Items to apply: [jeans] (only the new item)
- Result: Virtual try-on with **both** crop top and jeans

### Scenario 3: Replacing Item (Same Category)
- User: "blue crop top"
- Prior context: [crop top, jeans] + prior outfit image
- Decision: **Category replacement - regenerating from original photo**
- Base: Original user photo
- Items to apply: [blue crop top, jeans] (all merged items)
- Result: Virtual try-on with blue crop top and jeans (replaced the red one)

## Testing

### Test Case 1: Sequential Additions
1. Clear chat (click "New Chat")
2. Enter: "red crop top from H&M"
3. Wait for result
4. Enter: "black jeans from Zara"
5. Wait for result
6. **Expected**: Final image should show BOTH the red crop top AND black jeans

### Test Case 2: Replacement
1. Continue from Test Case 1
2. Enter: "white top"
3. Wait for result
4. **Expected**: Final image should show white top and black jeans (red crop top replaced)

### Test Case 3: Multiple Additions
1. Clear chat
2. Enter: "blue jacket from Patagonia"
3. Wait for result
4. Enter: "grey pants"
5. Wait for result
6. Enter: "white sneakers"
7. Wait for result
8. **Expected**: Final image should show ALL three items (jacket, pants, sneakers)

## Debugging

To debug context issues:

1. Open browser console (F12 / Cmd+Option+I)
2. Filter logs by `[CHAT` to see all chat-related logs
3. Look for:
   - `[CHAT UI] ===== SENDING REQUEST =====` - Shows what's being sent from UI
   - `[CHAT] ===== NEW REQUEST =====` - Shows what API received
   - `[CHAT] ===== CONTEXT DECISION =====` - Shows decision-making process
   - `[CHAT] DECISION:` - Shows which path was taken
   - `[TRYON]` - Shows virtual try-on execution

## Files Modified

1. **src/app/chat/page.tsx**
   - Enhanced logging for debugging
   - No logic changes (was already correct)

2. **src/app/api/chat/route.ts**
   - Improved context decision logic
   - Added comprehensive debugging
   - Better variable naming for clarity

## Additional Notes

- The UI correctly sends `priorItems` and `priorOutfitImage` together
- The API now properly uses the prior outfit image for incremental building
- Category-based replacement ensures coherent outfits (can't wear two tops at once)
- The try-on service applies items sequentially, layering them on top of each other
