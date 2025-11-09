# Outfit Builder Feature

## Overview
Your VESAKI chat interface now has a **smart outfit building feature** that allows users to incrementally build complete outfits by selecting multiple clothing items and seeing them all combined on a single person.

## How It Works

### User Experience Flow

1. **First Item**: User asks for an item (e.g., "red crop top from Zara")
   - System searches for the product
   - Applies it to the user's photo using virtual try-on
   - Shows the result with the product card

2. **Adding More Items**: User adds another item (e.g., "black jeans from H&M")
   - System remembers the previous outfit
   - Searches for the new item
   - **Intelligently combines** the new item with existing items
   - Shows all items on the same person

3. **Replacing Items**: User wants to swap an item (e.g., "blue jeans instead")
   - System detects items in the same category (both are "bottom" category)
   - **Replaces** the old jeans with the new blue jeans
   - Keeps other items (top, shoes, etc.)
   - Regenerates the outfit from scratch with all merged items

4. **Continue Building**: User keeps adding accessories, shoes, jackets, etc.
   - Each item is layered on top of the existing outfit
   - The virtual try-on builds incrementally for performance

### Technical Implementation

#### 1. **Context Tracking** (`src/app/chat/page.tsx`)
```typescript
// Lines 76-78
const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.products && m.products.length > 0);
const priorItems = lastAssistant?.products || [];
const priorOutfitImage = lastAssistant?.outfitImage;
```
- Tracks the last assistant message that had products
- Sends previous items and the generated outfit image as context

#### 2. **Smart Merging** (`src/app/api/chat/route.ts`)
```typescript
// Lines 312-317
const mergedItems: OutfitItem[] = mergeOutfitItems(
  Array.isArray(priorItems) ? priorItems : [],
  outfitItems
);
```

The `mergeOutfitItems` function (lines 604-625):
- Normalizes categories (e.g., "jeans", "pants", "trousers" → "bottom")
- **Replaces** items in the same category
- **Keeps** items in different categories
- Returns the merged outfit

Category normalization (lines 585-601):
- `outerwear`: jackets, coats, puffers, cardigans
- `top`: t-shirts, blouses, sweaters, hoodies
- `bottom`: jeans, pants, trousers, chinos
- `dress`, `skirt`, `footwear`, `bag`, `headwear`, `accessories`

#### 3. **Intelligent Virtual Try-On Strategy** (`src/app/api/chat/route.ts`, lines 334-354)

**Case A: Replacement (same category)**
```typescript
// Lines 340-342
baseImage = primaryPhoto.url;
itemsToApply = itemsForTryOn; // All merged items
```
- Starts from the user's original photo
- Applies ALL merged items from scratch
- Ensures replaced items don't show through

**Case B: Addition (new category)**
```typescript
// Lines 346-348
baseImage = priorOutfitImage;
itemsToApply = outfitItems; // Only new items
```
- Uses the previous outfit image as the base
- Only applies the NEW items on top
- More efficient - doesn't regenerate existing items

**Case C: First Item**
```typescript
// Lines 351-353
baseImage = primaryPhoto.url;
itemsToApply = itemsForTryOn;
```
- Uses the user's original photo
- Applies all items

#### 4. **Sequential Layering** (`src/services/tryon.ts`, lines 359-415)
```typescript
// Line 381-405: For each item
for (let i = 0; i < items.length; i++) {
  const item = items[i];
  const res = await generateVirtualTryOn({
    userPhotoUrl: base,  // Previous result or original
    productImageUrl: item.imageUrl,
    productName: item.name,
  });
  base = res.imageUrl; // Use this as base for next item
}
```
- Applies items one by one
- Each result becomes the base for the next
- Builds the complete outfit layer by layer

### UI Enhancements

#### 1. **Current Outfit Badge** (lines 284-301 in `page.tsx`)
- Shows how many items are currently in the outfit
- Displays brand names of items
- Visible above the input field
- Helps users track their outfit

#### 2. **Smart Placeholder Text**
- Changes from generic "Describe an item" to "Add to your outfit"
- Gives examples with brands (e.g., "black jeans from H&M")

#### 3. **Guided Responses**
- "Added to your outfit! Now wearing: ... Keep building your look!"
- "Updated your outfit! Now wearing: ... Want to add or replace anything else?"
- Encourages users to continue building

## Example Usage

### Scenario 1: Building a Complete Outfit
```
User: "red crop top from Zara"
AI: "Here's your look with: red crop top (top). Add more items to complete your outfit!"
[Shows person wearing red crop top]

User: "black jeans from H&M"
AI: "Added to your outfit! Now wearing: red crop top (top), black jeans (bottom). Keep building!"
[Shows person wearing BOTH red crop top AND black jeans]

User: "white Nike sneakers"
AI: "Added to your outfit! Now wearing: red crop top (top), black jeans (bottom), Nike sneakers (footwear)."
[Shows person wearing ALL THREE items]
```

### Scenario 2: Replacing an Item
```
User: "blue crop top from Zara"
AI: "Here's your look with: blue crop top (top)."
[Shows person wearing blue crop top]

User: "black jeans from H&M"
AI: "Added to your outfit! Now wearing: blue crop top (top), black jeans (bottom)."
[Shows both items]

User: "red crop top from Zara instead"
AI: "Updated your outfit! Now wearing: red crop top (top), black jeans (bottom)."
[Shows RED crop top with black jeans - the blue top was replaced]
```

## Key Features

✅ **Incremental Building**: Add items one by one to build complete outfits
✅ **Smart Replacement**: Items in the same category automatically replace previous ones
✅ **Visual Context**: See all items combined on a single person
✅ **Performance Optimized**: Uses incremental layering for additions, full regeneration only for replacements
✅ **Clear Feedback**: Users always know what's in their current outfit
✅ **Category Intelligence**: Understands clothing categories and relationships

## Configuration

The system uses:
- **Gemini 2.5 Flash Image** for virtual try-on generation
- **SerpAPI** for product search (falls back to internal DB if not available)
- **Gemini 2.5 Flash** for natural language understanding of product requests

## Troubleshooting

### Products Not Combining
- Ensure `priorItems` and `priorOutfitImage` are being sent in the API request
- Check console logs for "[CHAT UI] Prior items count" and "[CHAT UI] Prior outfit image"

### Items Not Replacing Correctly
- Verify category normalization in `normalizeCategory()` function
- Check if the items are truly in the same category (e.g., both "top" or both "bottom")

### Try-On Quality Issues
- The system regenerates from scratch when replacing items for best quality
- Gemini's virtual try-on works best with clear product images and full-body user photos

## Future Enhancements

Potential improvements:
- Allow users to manually remove specific items
- Add a "Save Outfit" button to save combinations
- Show side-by-side comparison when replacing items
- Add outfit suggestions based on current items
- Allow reordering of layers (e.g., jacket over vs. under scarf)
