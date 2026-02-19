
import { GoogleGenAI, Type } from "@google/genai";
import { SalesData, FinishGood } from "../types";

// Always use process.env.API_KEY directly as a named parameter in the constructor.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getSmartForecasting = async (sales: SalesData[], skus: FinishGood[]) => {
  const prompt = `
    Analyze this sales data for a Bakso business:
    ${JSON.stringify(sales)}
    
    Current SKUs:
    ${JSON.stringify(skus)}
    
    Task: Predict demand for the next 7 days for each SKU. 
    Return the result as a JSON array of objects with 'skuId' and 'predictedPacks'.
    Include a short justification for the forecast.
  `;

  try {
    // Using gemini-3-pro-preview for complex forecasting and data analysis tasks.
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            forecasts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  skuId: { type: Type.STRING },
                  predictedPacks: { type: Type.NUMBER },
                  reason: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    // Directly access the .text property (not a method) from the response.
    const resultText = response.text;
    if (!resultText) {
      throw new Error("The model returned an empty response.");
    }

    const parsedData = JSON.parse(resultText);
    return parsedData.forecasts;
  } catch (error) {
    console.error("Forecasting error:", error);
    // Fallback: simple average estimation
    return skus.map(sku => ({
      skuId: sku.id,
      predictedPacks: 100,
      reason: "Fallback estimation (API error)"
    }));
  }
};
