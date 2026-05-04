import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface NormalizedItem {
  normalizedName: string;
  category: string;
  isStapleSuggestion: boolean;
  quantity?: string;
  isPurchased?: boolean;
}

export interface BulkImportResult {
  items: NormalizedItem[];
}

export async function normalizeItem(input: string): Promise<NormalizedItem> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Normalize this shopping list item to help avoid duplicates.
      For example: '3 bags of frozen peas' -> Name: 'peas, frozen', Quantity: '3 bags'.
      Input: "${input}"
      
      Also provide a likely grocery category (e.g., Produce, Dairy, Meat, Frozen, Pantry, Household) 
      and whether it's typically a 'staple' item (something people buy repeatedly).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            normalizedName: { type: Type.STRING },
            category: { type: Type.STRING },
            isStapleSuggestion: { type: Type.BOOLEAN },
            quantity: { type: Type.STRING, description: "Extract number and units if present, e.g., '1', '2 boxes', '1 lb'" }
          },
          required: ["normalizedName", "category", "isStapleSuggestion"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return {
      normalizedName: result.normalizedName || input.toLowerCase().trim(),
      category: result.category || "General",
      isStapleSuggestion: !!result.isStapleSuggestion,
      quantity: result.quantity || ""
    };
  } catch (error) {
    console.error("Gemini normalization failed:", error);
    return {
      normalizedName: input.toLowerCase().trim(),
      category: "General",
      isStapleSuggestion: false
    };
  }
}

export async function bulkNormalizeItems(input: string): Promise<NormalizedItem[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extract shopping list items from this text. The text may contain nested structures, category headers, and checkbox symbols.
      
      Instructions:
      1. Ignore lines that are clearly category headers unless they represent actual items.
      2. Use headers to influence the 'category' field of items listed under them.
      3. Identify if an item is 'checked' or 'purchased' based on symbols like '[x]', '[X]', or strikethrough-like markers. 
         - '[ ]' or no symbol means isPurchased: false.
         - '[x]' or '[X]' means isPurchased: true.
      4. For each actual shopping item, provide:
         - normalizedName: e.g., 'frozen peas' -> 'peas, frozen'.
         - quantity: extract number and units if present.
         - category: Choose the best fit from: Produce, Dairy, Meat, Frozen, Pantry, Household, Bakery, Beverages, or Other.
         - isStapleSuggestion: true if common recurring purchase.
         - isPurchased: boolean based on checkbox symbols.
      
      Input text:
      "${input}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  normalizedName: { type: Type.STRING },
                  category: { type: Type.STRING },
                  quantity: { type: Type.STRING },
                  isStapleSuggestion: { type: Type.BOOLEAN },
                  isPurchased: { type: Type.BOOLEAN }
                },
                required: ["normalizedName", "category", "isStapleSuggestion", "isPurchased"]
              }
            }
          },
          required: ["items"]
        }
      }
    });

    const result = JSON.parse(response.text || '{"items":[]}');
    return result.items || [];
  } catch (error) {
    console.error("Gemini bulk normalization failed:", error);
    return [];
  }
}
