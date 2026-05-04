import { onCall, HttpsError } from "firebase-functions/v2/https";
import { GoogleGenAI, Type } from "@google/genai";

// The API key is stored securely as a Firebase Secret — never in client code.
// To set it, run: firebase functions:secrets:set GEMINI_API_KEY
const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Single Item Normalization ─────────────────────────────────────────────

export const normalizeItem = onCall(
  { secrets: ["GEMINI_API_KEY"] },
  async (request) => {
    const { text } = request.data as { text: string };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      throw new HttpsError("invalid-argument", "text is required");
    }
    if (text.length > 200) {
      throw new HttpsError("invalid-argument", "text is too long");
    }

    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Normalize this shopping list item to help avoid duplicates.
For example: '3 bags of frozen peas' -> Name: 'peas, frozen', Quantity: '3 bags'.
Input: "${text.trim()}"

Also provide a likely grocery category (Produce, Dairy, Meat, Frozen, Pantry, Household, Bakery, Beverages, or Other)
and whether it's typically a 'staple' item (something people buy repeatedly).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              normalizedName: { type: Type.STRING },
              category: { type: Type.STRING },
              isStapleSuggestion: { type: Type.BOOLEAN },
              quantity: { type: Type.STRING },
            },
            required: ["normalizedName", "category", "isStapleSuggestion"],
          },
        },
      });

      const result = JSON.parse(response.text || "{}");
      return {
        normalizedName: result.normalizedName || text.toLowerCase().trim(),
        category: result.category || "Other",
        isStapleSuggestion: !!result.isStapleSuggestion,
        quantity: result.quantity || "",
      };
    } catch (err) {
      console.error("normalizeItem failed:", err);
      return {
        normalizedName: text.toLowerCase().trim(),
        category: "Other",
        isStapleSuggestion: false,
        quantity: "",
      };
    }
  }
);

// ── Bulk Import Normalization ─────────────────────────────────────────────

export const bulkNormalizeItems = onCall(
  { secrets: ["GEMINI_API_KEY"] },
  async (request) => {
    const { text } = request.data as { text: string };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      throw new HttpsError("invalid-argument", "text is required");
    }
    if (text.length > 5000) {
      throw new HttpsError("invalid-argument", "text is too long (max 5000 chars)");
    }

    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Extract shopping list items from this text. The text may contain nested structures, category headers, and checkbox symbols.

Instructions:
1. Ignore lines that are clearly category headers unless they represent actual items.
2. Use headers to influence the 'category' field of items listed under them.
3. Identify if an item is checked based on symbols like '[x]', '[X]'. '[ ]' or no symbol = not purchased.
4. For each item provide: normalizedName, quantity, category (Produce/Dairy/Meat/Frozen/Pantry/Household/Bakery/Beverages/Other), isStapleSuggestion, isPurchased.

Input text:
"${text.trim()}"`,
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
                    isPurchased: { type: Type.BOOLEAN },
                  },
                  required: ["normalizedName", "category", "isStapleSuggestion", "isPurchased"],
                },
              },
            },
            required: ["items"],
          },
        },
      });

      const result = JSON.parse(response.text || '{"items":[]}');
      return { items: result.items || [] };
    } catch (err) {
      console.error("bulkNormalizeItems failed:", err);
      return { items: [] };
    }
  }
);
