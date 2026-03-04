import React, { useState, useCallback } from 'react';
import { 
  Search, 
  Upload, 
  FileText, 
  ShieldCheck, 
  Zap, 
  BarChart3, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Download,
  RefreshCcw,
  BookOpen,
  LayoutDashboard,
  FileSearch,
  Wand2,
  Settings,
  User,
  MessageSquare
} from 'lucide-react';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { analyzeTitle, analyzeDocument, autoFixContent, setApiKey, type TitleAnalysis, type DeepReview } from './services/geminiService';

// PDF.js worker setup
const PDF_JS_VERSION = '5.5.207'; // Match package.json
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjsLib as any).version || PDF_JS_VERSION}/pdf.worker.min.js`;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [title, setTitle] = useState('');
  const [titleAnalysis, setTitleAnalysis] = useState<TitleAnalysis | null>(null);
  const [isAnalyzingTitle, setIsAnalyzingTitle] = useState(false);
  
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [deepReview, setDeepReview] = useState<DeepReview | null>(null);
  
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [fixedContent, setFixedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState(() => {
    const saved = localStorage.getItem('GEMINI_API_KEY');
    if (saved) setApiKey(saved);
    return saved || '';
  });

  const handleSaveApiKey = () => {
    localStorage.setItem('GEMINI_API_KEY', tempApiKey);
    setSavedApiKey(tempApiKey);
    setApiKey(tempApiKey);
    setShowApiKeyModal(false);
  };

  const handleTitleAnalysis = async () => {
    if (!title.trim()) return;
    
    if (!savedApiKey && !process.env.GEMINI_API_KEY) {
      setError('Vui lòng nhập Gemini API Key trong phần Cài đặt để sử dụng tính năng này.');
      setShowApiKeyModal(true);
      return;
    }

    setIsAnalyzingTitle(true);
    setError(null);
    try {
      const result = await analyzeTitle(title);
      setTitleAnalysis(result);
    } catch (err: any) {
      console.error('Title analysis failed', err);
      setError(err.message || 'Phân tích tên đề tài thất bại. Vui lòng kiểm tra API Key.');
      if (err.message?.includes('API Key')) setShowApiKeyModal(true);
    } finally {
      setIsAnalyzingTitle(false);
    }
  };

  const handleOpenApiKey = async () => {
    if (typeof window !== 'undefined' && (window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
    }
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    try {
      if (extension === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item: any) => (item as any).str).join(' ') + '\n';
        }
        return fullText;
      } else if (extension === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        // Handle potential default export issues with mammoth in Vite/ESM
        const mammothLib = (mammoth as any).extractRawText ? mammoth : (mammoth as any).default;
        if (!mammothLib || !mammothLib.extractRawText) {
          throw new Error('Thư viện Mammoth không khả dụng.');
        }
        const result = await mammothLib.extractRawText({ arrayBuffer });
        return result.value;
      } else {
        return await file.text();
      }
    } catch (error: any) {
      console.error('Error extracting text:', error);
      throw new Error(`Lỗi khi đọc tệp ${file.name}: ${error.message || 'Định dạng không hỗ trợ'}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Tệp quá lớn. Vui lòng chọn tệp nhỏ hơn 10MB.');
      return;
    }

    setFile(selectedFile);
    
    if (!savedApiKey && !process.env.GEMINI_API_KEY) {
      setError('Vui lòng nhập Gemini API Key trong phần Cài đặt để sử dụng tính năng này.');
      setShowApiKeyModal(true);
      return;
    }

    setIsProcessingFile(true);
    setError(null);
    setProcessingStep('Đang đọc và trích xuất nội dung tài liệu...');
    try {
      const text = await extractTextFromFile(selectedFile);
      setFileContent(text);
      setProcessingStep('Đang thẩm định nội dung theo Thông tư 27...');
      const review = await analyzeDocument(text, title || selectedFile.name);
      setDeepReview(review);
    } catch (err: any) {
      console.error('File processing failed', err);
      setError(err.message || 'Xử lý tài liệu thất bại. Vui lòng thử lại.');
      if (err.message?.includes('API Key')) setShowApiKeyModal(true);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleAutoFix = async () => {
    if (!fileContent) return;
    setIsAutoFixing(true);
    setError(null);
    try {
      const result = await autoFixContent(fileContent);
      setFixedContent(result);
    } catch (err: any) {
      console.error('Auto fix failed', err);
      setError(err.message || 'Tự động sửa lỗi thất bại.');
      if (err.message?.includes('API Key')) setShowApiKeyModal(true);
    } finally {
      setIsAutoFixing(false);
    }
  };

  const radarData = deepReview ? [
    { subject: 'Tính mới', A: deepReview.scores.novelty, fullMark: 30 },
    { subject: 'Khả thi', A: deepReview.scores.feasibility, fullMark: 40 },
    { subject: 'Khoa học', A: deepReview.scores.scientificity, fullMark: 20 },
    { subject: 'Hình thức', A: deepReview.scores.form, fullMark: 10 },
  ] : [];

  return (
    <div className="min-h-screen tech-grid">
      {/* Header */}
      <header className="bg-gray-900/50 backdrop-blur-md border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div 
              whileHover={{ rotate: 10, scale: 1.1 }}
              className="w-12 h-12 bg-indigo-600 flex items-center justify-center rounded-2xl shadow-lg shadow-indigo-500/20"
            >
              <ShieldCheck className="text-white w-7 h-7" />
            </motion.div>
            <div>
              <h1 className="font-black text-2xl text-white tracking-tight glow-text">SKKN checker <span className="text-indigo-400">Pro</span></h1>
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">TẠO VÀ PHÁT TRIỂN BỞI THẦY KSOR GÉ</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noreferrer" 
              className="bg-white/5 text-slate-300 px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-white/10 transition-all border border-white/5"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              Get API
            </a>
            <button 
              onClick={() => {
                setTempApiKey(savedApiKey);
                setShowApiKeyModal(true);
              }}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20"
            >
              <Settings className="w-3.5 h-3.5" />
              {savedApiKey ? 'Đã lưu API' : 'Nhập Key'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-16 space-y-16">
        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl flex items-center gap-4"
            >
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div className="flex-1">
                <p className="text-red-400 font-bold">{error}</p>
              </div>
              <button 
                onClick={() => setError(null)}
                className="text-red-400/50 hover:text-red-400 transition-colors"
              >
                <RefreshCcw className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Section 1: Title Analysis */}
        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
              <Search className="w-5 h-5 text-indigo-400" />
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-widest">Phân tích Tên đề tài</h2>
          </div>
          <div className="glass-card p-8">
            <div className="relative flex items-center">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nhập tên đề tài sáng kiến kinh nghiệm của bạn..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-6 px-8 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/30 transition-all outline-none text-lg"
              />
              <button 
                onClick={handleTitleAnalysis}
                disabled={isAnalyzingTitle || !title}
                className="absolute right-4 bg-indigo-600 text-white px-8 py-4 rounded-xl hover:bg-indigo-500 transition-all disabled:opacity-30 flex items-center gap-3 font-black text-sm shadow-xl shadow-indigo-500/20"
              >
                {isAnalyzingTitle ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                PHÂN TÍCH
              </button>
            </div>
            
            <AnimatePresence>
              {titleAnalysis && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-10 pt-10 border-t border-white/5 grid grid-cols-1 md:grid-cols-12 gap-12"
                >
                  <div className="md:col-span-3 flex flex-col items-center justify-center border-r border-white/5">
                    <div className="relative">
                      <div className="absolute inset-0 blur-2xl bg-indigo-500/20 rounded-full" />
                      <span className="relative text-7xl font-black text-white glow-text">{titleAnalysis.score}</span>
                    </div>
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mt-4">Score / 10</span>
                  </div>
                  <div className="md:col-span-9 space-y-8">
                    <div className="space-y-3">
                      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Nhận xét chuyên gia</h3>
                      <p className="text-slate-300 italic font-serif leading-relaxed text-xl">"{titleAnalysis.critique}"</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {titleAnalysis.suggestions.map((s, i) => (
                        <motion.div 
                          key={i} 
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="p-5 bg-white/5 rounded-2xl border border-white/5 text-sm text-slate-300 flex items-start gap-4 group hover:bg-white/10 transition-all relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 bg-indigo-600 text-white px-4 py-1.5 rounded-bl-2xl text-[10px] font-black shadow-lg">
                            {s.score}/10
                          </div>
                          <CheckCircle2 className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                          <span className="pr-12 font-medium leading-relaxed">{s.text}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Section 2: File Upload */}
        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
              <Upload className="w-5 h-5 text-indigo-400" />
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-widest">Tải lên Tài liệu (PDF/Word)</h2>
          </div>
          
          <div className="glass-card p-3">
            <label className="block w-full border-2 border-dashed border-white/5 rounded-[28px] bg-white/5 py-24 text-center cursor-pointer hover:bg-white/10 transition-all group relative overflow-hidden">
              <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileUpload} />
              <div className="flex flex-col items-center gap-8 max-w-lg mx-auto px-6 relative z-10">
                <motion.div 
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="w-24 h-24 bg-indigo-600/20 text-indigo-400 rounded-3xl flex items-center justify-center border border-indigo-500/20 shadow-2xl shadow-indigo-500/10"
                >
                  <FileText className="w-12 h-12" />
                </motion.div>
                <div className="space-y-4">
                  <h3 className="text-3xl font-black text-white tracking-tight">Kéo thả file vào đây</h3>
                  <p className="text-slate-400 text-sm leading-relaxed font-medium">
                    Hỗ trợ định dạng .pdf, .docx, .txt. Hệ thống sẽ tự động quét nội dung và thẩm định theo Thông tư 27.
                  </p>
                </div>
                <div className="bg-white text-gray-900 px-12 py-5 rounded-2xl font-black text-sm shadow-2xl hover:scale-105 transition-transform">
                  {isProcessingFile ? (
                    <div className="flex items-center gap-4">
                      <RefreshCcw className="w-5 h-5 animate-spin text-indigo-600" />
                      <span>{processingStep}</span>
                    </div>
                  ) : "CHỌN FILE TỪ MÁY TÍNH"}
                </div>
                {isProcessingFile && (
                  <motion.div 
                    initial={{ top: 0 }}
                    animate={{ top: '100%' }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute left-0 right-0 h-1 bg-indigo-500/50 blur-sm z-20"
                  />
                )}
              </div>
            </label>
          </div>

          <AnimatePresence>
            {deepReview && (
              <motion.div 
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12 mt-16"
              >
                {/* Dashboard Results */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 glass-card p-12 flex flex-col md:flex-row gap-16">
                    <div className="w-full md:w-1/2 h-[350px] relative">
                      <div className="absolute inset-0 blur-3xl bg-indigo-500/10 rounded-full" />
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                          <PolarGrid stroke="rgba(255,255,255,0.05)" />
                          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fontWeight: 800, fill: '#94a3b8', letterSpacing: '0.1em' }} />
                          <PolarRadiusAxis angle={30} domain={[0, 40]} tick={false} axisLine={false} />
                          <Radar
                            name="SKKN"
                            dataKey="A"
                            stroke="#6366f1"
                            fill="#6366f1"
                            fillOpacity={0.2}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full md:w-1/2 flex flex-col justify-center space-y-10">
                      <div>
                        <div className="relative inline-block">
                          <div className="absolute inset-0 blur-2xl bg-indigo-500/20 rounded-full" />
                          <div className="relative text-8xl font-black text-white tracking-tighter glow-text">
                            {Object.values(deepReview.scores).reduce((a, b) => a + b, 0)}
                            <span className="text-3xl text-slate-600 font-bold">/100</span>
                          </div>
                        </div>
                        <p className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em] mt-4">Tổng điểm thẩm định</p>
                      </div>
                      <div className="grid grid-cols-2 gap-12">
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ĐẠO VĂN</p>
                          <p className={cn("text-4xl font-black glow-text", deepReview.plagiarism > 20 ? "text-red-400" : "text-emerald-400")}>
                            {deepReview.plagiarism}%
                          </p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">NGUY CƠ AI</p>
                          <p className={cn("text-4xl font-black glow-text", deepReview.aiRisk > 30 ? "text-orange-400" : "text-emerald-400")}>
                            {deepReview.aiRisk}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-4 bg-indigo-600 text-white p-12 rounded-[40px] shadow-2xl shadow-indigo-500/20 flex flex-col justify-between relative overflow-hidden group">
                    <Zap className="absolute -top-12 -right-12 w-64 h-64 opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-700" />
                    <div className="space-y-8 relative z-10">
                      <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10">
                        <Wand2 className="w-3.5 h-3.5" /> Premium Engine
                      </div>
                      <h3 className="text-4xl font-black leading-tight tracking-tight">Auto Fix<br/>Premium</h3>
                      <p className="text-indigo-100/80 leading-relaxed font-medium">Nâng cấp văn phong, giảm tỷ lệ AI và tối ưu thuật ngữ sư phạm tự động chỉ với một chạm.</p>
                    </div>
                    <button 
                      onClick={handleAutoFix}
                      disabled={isAutoFixing}
                      className="w-full bg-white text-indigo-600 py-6 rounded-2xl font-black text-sm shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 mt-12 relative z-10"
                    >
                      {isAutoFixing ? <RefreshCcw className="w-5 h-5 animate-spin mx-auto" /> : "KÍCH HOẠT AUTO FIX"}
                    </button>
                  </div>
                </div>

                {/* Deep Review Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-2 glass-card p-12 space-y-12">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
                        <FileSearch className="w-5 h-5 text-indigo-400" />
                      </div>
                      <h2 className="text-xl font-black text-white uppercase tracking-widest">Phân tích chuyên sâu</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                      <div className="space-y-5">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cấu trúc</h4>
                        <p className="text-sm text-slate-400 leading-relaxed font-medium">{deepReview.deepReview.structure}</p>
                      </div>
                      <div className="space-y-5">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sư phạm</h4>
                        <p className="text-sm text-slate-300 leading-relaxed italic font-serif text-lg">{deepReview.deepReview.pedagogy}</p>
                      </div>
                      <div className="space-y-5">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Minh chứng</h4>
                        <p className="text-sm text-slate-400 leading-relaxed font-medium">{deepReview.deepReview.data}</p>
                      </div>
                    </div>

                    {/* Improvement Suggestions */}
                    <div className="pt-12 border-t border-white/5 space-y-8">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center border border-orange-500/20">
                          <AlertCircle className="w-5 h-5 text-orange-400" />
                        </div>
                        <h3 className="text-xl font-black text-white uppercase tracking-widest">Nội dung cần chỉnh sửa</h3>
                      </div>
                      <div className="grid grid-cols-1 gap-6">
                        {deepReview.improvementSuggestions.map((item, i) => (
                          <motion.div 
                            key={i} 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.1 }}
                            className="bg-white/5 rounded-3xl p-8 border border-white/5 space-y-5 group hover:bg-white/10 transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest bg-orange-500/10 px-4 py-1.5 rounded-full border border-orange-500/20">
                                {item.section}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div className="space-y-2">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Vấn đề</p>
                                <p className="text-sm text-slate-300 font-medium leading-relaxed">{item.issue}</p>
                              </div>
                              <div className="space-y-2">
                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Cách sửa</p>
                                <p className="text-sm text-indigo-100 font-medium leading-relaxed">{item.fix}</p>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="glass-card p-10 space-y-8">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
                          <ShieldCheck className="w-5 h-5 text-indigo-400" />
                        </div>
                        <h2 className="text-lg font-black text-white uppercase tracking-widest">Nguồn trùng lặp</h2>
                      </div>
                      <div className="space-y-4">
                        {deepReview.plagiarismSources.map((source, i) => (
                          <a 
                            key={i} 
                            href={source.url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="block p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all group"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Tương đồng {source.matchPercentage}%</span>
                              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                            </div>
                            <p className="text-xs font-bold text-slate-200 line-clamp-2 group-hover:text-white transition-colors leading-relaxed">{source.title}</p>
                            <p className="text-[10px] text-slate-500 mt-2 truncate font-mono">{source.url}</p>
                          </a>
                        ))}
                      </div>
                    </div>

                    <div className="glass-card p-10 space-y-8">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
                          <BookOpen className="w-5 h-5 text-indigo-400" />
                        </div>
                        <h2 className="text-lg font-black text-white uppercase tracking-widest">Tham khảo</h2>
                      </div>
                      <div className="space-y-5">
                        {deepReview.references.map((ref, i) => (
                          <div key={i} className="flex gap-4 group cursor-pointer">
                            <span className="text-[10px] font-black text-indigo-500 group-hover:text-indigo-400 transition-colors mt-1 font-mono">0{i+1}</span>
                            <p className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors leading-relaxed font-medium">{ref}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Auto Fixed Content */}
                {fixedContent && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-emerald-500/5 p-12 rounded-[48px] border border-emerald-500/20 space-y-10 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] -mr-32 -mt-32" />
                    <div className="flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center border border-emerald-500/30">
                          <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                        </div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Bản thảo đã tối ưu</h2>
                      </div>
                      <div className="flex gap-4">
                        <button 
                          onClick={() => navigator.clipboard.writeText(fixedContent)}
                          className="bg-white/5 text-emerald-400 px-8 py-4 rounded-2xl text-xs font-black border border-emerald-500/20 hover:bg-white/10 transition-all tracking-widest"
                        >
                          SAO CHÉP
                        </button>
                        <button className="bg-emerald-600 text-white px-8 py-4 rounded-2xl text-xs font-black shadow-2xl shadow-emerald-500/20 hover:bg-emerald-500 transition-all tracking-widest">
                          TẢI VỀ (.DOCX)
                        </button>
                      </div>
                    </div>
                    <div className="bg-gray-900/50 backdrop-blur-md p-10 rounded-[32px] text-slate-300 font-serif leading-relaxed text-xl whitespace-pre-wrap max-h-[600px] overflow-y-auto border border-white/5 shadow-inner relative z-10">
                      {fixedContent}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-950 border-t border-white/5 pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-20">
          <div className="md:col-span-5 space-y-10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-600 flex items-center justify-center rounded-2xl shadow-2xl shadow-indigo-500/20">
                <ShieldCheck className="text-white w-8 h-8" />
              </div>
              <h2 className="font-black text-3xl text-white tracking-tight glow-text">SKKN Checker Pro</h2>
            </div>
            <p className="text-slate-400 leading-relaxed max-w-sm font-medium">
              Giải pháp AI hàng đầu hỗ trợ giáo viên thẩm định và hoàn thiện Sáng kiến kinh nghiệm theo tiêu chuẩn Bộ Giáo dục.
            </p>
          </div>

          <div className="md:col-span-4 space-y-10">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">LIÊN HỆ</h3>
            <div className="space-y-5">
              <div className="bg-white/5 p-5 rounded-3xl flex items-center gap-5 border border-white/5 group hover:bg-white/10 transition-all">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
                  <User className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">Tác giả: Thầy Ksor Gé</p>
                </div>
              </div>
              <div className="bg-indigo-600/10 p-5 rounded-3xl flex items-center gap-5 border border-indigo-500/20 group hover:bg-indigo-600/20 transition-all">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">Zalo: 0383752789</p>
                  <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mt-1">Hỗ trợ kỹ thuật & Tư vấn</p>
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-3 space-y-10">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">PHÁP LÝ & BẢO MẬT</h3>
            <ul className="space-y-5">
              <li><a href="#" className="text-sm font-bold text-slate-400 hover:text-indigo-400 transition-all flex items-center gap-3"><ChevronRight className="w-3 h-3" /> Điều khoản sử dụng</a></li>
              <li><a href="#" className="text-sm font-bold text-slate-400 hover:text-indigo-400 transition-all flex items-center gap-3"><ChevronRight className="w-3 h-3" /> Chính sách bảo mật</a></li>
              <li><a href="#" className="text-sm font-bold text-slate-400 hover:text-indigo-400 transition-all flex items-center gap-3"><ChevronRight className="w-3 h-3" /> Hướng dẫn Thông tư 27</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-24 pt-10 border-t border-white/5 text-center">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.6em]">© 2026 SKKN Checker Pro • Designed for Educators</p>
        </div>
      </footer>

      {/* API Key Modal */}
      <AnimatePresence>
        {showApiKeyModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowApiKeyModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl p-8 space-y-6"
            >
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900">Cấu hình Gemini API</h3>
                <p className="text-sm text-slate-500">Nhập API Key của bạn để bắt đầu sử dụng các tính năng AI cao cấp.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">API KEY</label>
                  <input 
                    type="password"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="Dán key của bạn vào đây..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-4 px-5 text-slate-700 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowApiKeyModal(false)}
                    className="flex-1 px-6 py-4 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={handleSaveApiKey}
                    className="flex-1 bg-[#4F46E5] text-white px-6 py-4 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all"
                  >
                    Lưu cấu hình
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-center text-slate-400">
                Key của bạn được lưu an toàn trong trình duyệt (LocalStorage)
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
