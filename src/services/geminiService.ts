import { GoogleGenAI, Type } from "@google/genai";

let customApiKey: string | null = null;

export const setApiKey = (key: string) => {
  customApiKey = key;
};

const getAI = () => {
  // Use custom key if provided, otherwise fallback to environment variable
  // Vite's 'define' will replace process.env.GEMINI_API_KEY with a string value
  const apiKey = customApiKey || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '');
  
  if (!apiKey) {
    throw new Error("API Key is missing. Please provide a Gemini API Key.");
  }
  return new GoogleGenAI({ apiKey });
};

export interface TitleAnalysis {
  score: number;
  critique: string;
  suggestions: { text: string; score: number }[];
}

export interface DeepReview {
  scores: {
    novelty: number; // max 30
    feasibility: number; // max 40
    scientificity: number; // max 20
    form: number; // max 10
  };
  plagiarism: number;
  aiRisk: number;
  summary: string;
  deepReview: {
    structure: string;
    pedagogy: string;
    data: string;
  };
  improvementSuggestions: { section: string; issue: string; fix: string }[];
  plagiarismSources: { title: string; url: string; matchPercentage: number }[];
  references: string[];
}

export const analyzeTitle = async (title: string): Promise<TitleAnalysis> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Hãy phân tích tên đề tài Sáng kiến kinh nghiệm (SKKN) sau đây theo Thông tư 27/2020/TT-BGDĐT: "${title}"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER, description: "Chấm điểm tên đề tài trên thang 10" },
          critique: { type: Type.STRING, description: "Nhận xét chi tiết về điểm yếu, điểm mạnh" },
          suggestions: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: "Nội dung tên đề tài gợi ý" },
                score: { type: Type.NUMBER, description: "Điểm dự kiến cho tên đề tài này (thang 10)" }
              },
              required: ["text", "score"]
            },
            description: "Đề xuất 3-5 phương án tên mới chuyên sâu, hấp dẫn hơn kèm điểm số dự kiến"
          }
        },
        required: ["score", "critique", "suggestions"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const analyzeDocument = async (content: string, title: string): Promise<DeepReview> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Bạn là bộ não AI cao cấp của "SKKN Checker Pro". Hãy thẩm định toàn bộ nội dung Sáng kiến kinh nghiệm (SKKN) sau đây.
    
    Tên đề tài: ${title}
    Nội dung: ${content.substring(0, 30000)} // Truncate if too long
    
    Yêu cầu:
    1. Chấm điểm theo Thông tư 27/2020/TT-BGDĐT.
    2. Kiểm tra tính mới, khả thi, khoa học và hình thức.
    3. Giả lập chỉ số đạo văn và nguy cơ AI dựa trên văn phong.
    4. Đưa ra nhận xét sâu sắc về sư phạm.
    5. Chỉ ra CÁC NỘI DUNG CẦN CHỈNH SỬA chi tiết (vấn đề là gì, cách sửa thế nào).
    6. Liệt kê các NGUỒN TRÙNG LẶP (giả lập các bài báo, SKKN tương tự trên mạng có link tham khảo).
    7. Đề xuất 6-8 tài liệu tham khảo.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scores: {
            type: Type.OBJECT,
            properties: {
              novelty: { type: Type.NUMBER },
              feasibility: { type: Type.NUMBER },
              scientificity: { type: Type.NUMBER },
              form: { type: Type.NUMBER }
            },
            required: ["novelty", "feasibility", "scientificity", "form"]
          },
          plagiarism: { type: Type.NUMBER, description: "Phần trăm đạo văn giả lập" },
          aiRisk: { type: Type.NUMBER, description: "Phần trăm nguy cơ AI giả lập" },
          summary: { type: Type.STRING, description: "Tóm tắt kết quả tổng quát" },
          deepReview: {
            type: Type.OBJECT,
            properties: {
              structure: { type: Type.STRING, description: "Kiểm tra cấu trúc" },
              pedagogy: { type: Type.STRING, description: "Đánh giá độ sâu sư phạm" },
              data: { type: Type.STRING, description: "Kiểm tra bảng biểu, minh chứng" }
            },
            required: ["structure", "pedagogy", "data"]
          },
          improvementSuggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                section: { type: Type.STRING, description: "Phần cần chỉnh sửa" },
                issue: { type: Type.STRING, description: "Vấn đề hiện tại" },
                fix: { type: Type.STRING, description: "Gợi ý cách sửa" }
              },
              required: ["section", "issue", "fix"]
            },
            description: "Danh sách các điểm cần cải thiện"
          },
          plagiarismSources: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Tên bài viết/SKKN tương tự" },
                url: { type: Type.STRING, description: "Link tham khảo (giả lập hoặc thực tế)" },
                matchPercentage: { type: Type.NUMBER, description: "Tỷ lệ trùng lặp" }
              },
              required: ["title", "url", "matchPercentage"]
            },
            description: "Các nguồn có nội dung tương tự"
          },
          references: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "6-8 tài liệu tham khảo"
          }
        },
        required: ["scores", "plagiarism", "aiRisk", "summary", "deepReview", "improvementSuggestions", "plagiarismSources", "references"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const autoFixContent = async (content: string): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Hãy thực hiện "AUTO FIX" cho đoạn văn bản SKKN sau đây:
    1. Giảm AI: Chỉnh sửa văn phong cá nhân hóa, thêm cảm xúc để mức AI <15%.
    2. Nâng cấp từ vựng: Dùng thuật ngữ giáo dục chuyên ngành.
    3. Paraphrasing: Viết lại các đoạn có nguy cơ trùng lặp.
    
    Văn bản: ${content.substring(0, 10000)}`,
    config: {
      systemInstruction: "Bạn là chuyên gia biên tập SKKN cao cấp. Hãy trả về văn bản đã được chỉnh sửa hoàn chỉnh, giữ nguyên cấu trúc nhưng nâng cấp chất lượng ngôn từ."
    }
  });

  return response.text || content;
};
