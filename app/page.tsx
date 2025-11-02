'use client';

import { useState, useCallback } from 'react';
import { Download, AlertCircle, CheckCircle, ArrowRight, ArrowLeft, ExternalLink } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import { parseFile, parseFileMulti, transformData, transformDataMulti, generateCSV, generateExcel, ParsedData, ParsedDataMulti, TransformOptions, TransformedRow } from '@/lib/parsers';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'single' | 'multi'>('single');
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [transformedData, setTransformedData] = useState<TransformedRow[]>([]);
  const [error, setError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  
  // Form options
  const [currency, setCurrency] = useState('SEK');
  const [parentId, setParentId] = useState('ENTITY_ID');
  const [periodicity, setPeriodicity] = useState('');
  const [useCategoryLeaf, setUseCategoryLeaf] = useState(true);

  // Multi-entity parsed data
  const [parsedDataMulti, setParsedDataMulti] = useState<ParsedDataMulti | null>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setError('');
    setIsProcessing(true);
    
    try {
      if (activeTab === 'multi') {
        const data = await parseFileMulti(file);
        setParsedDataMulti(data);
        setParsedData(null);
      } else {
        const data = await parseFile(file);
        setParsedData(data);
        setParsedDataMulti(null);
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setParsedData(null);
      setParsedDataMulti(null);
    } finally {
      setIsProcessing(false);
    }
  }, [activeTab]);

  const handleContinue = useCallback(() => {
    if (!selectedFile) return;
    if (activeTab === 'multi') {
      // Skip config step for multi; go directly to transform
      setCurrentStep(2);
    } else if (parsedData) {
      setCurrentStep(2);
    }
  }, [selectedFile, parsedData, activeTab]);

  const handleTransform = useCallback(async () => {
    if (activeTab === 'multi') {
      if (!parsedDataMulti) return;
      setIsTransforming(true);
      setError('');
      try {
        const transformed = transformDataMulti(parsedDataMulti);
        setTransformedData(transformed);
        setError('');
        setCurrentStep(3);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to transform data');
        setTransformedData([]);
      } finally {
        setIsTransforming(false);
      }
      return;
    }
    if (!parsedData) return;
    
    setIsTransforming(true);
    setError('');
    
    try {
      const options: TransformOptions = {
        currency: currency.toUpperCase(),
        parentId,
        periodicity: periodicity.trim() || undefined
      };
      
      const transformed = transformData(parsedData, options);
      setTransformedData(transformed);
      setError('');
      setCurrentStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transform data');
      setTransformedData([]);
    } finally {
      setIsTransforming(false);
    }
  }, [activeTab, parsedData, parsedDataMulti, currency, parentId, useCategoryLeaf]);

  const handleDownload = useCallback(() => {
    if (transformedData.length === 0) return;
    
    const csv = generateCSV(transformedData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'transformed');
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [transformedData]);

  const handleDownloadExcel = useCallback(() => {
    if (transformedData.length === 0) return;
    
    const excelData = generateExcel(transformedData); // ArrayBuffer
    const blob = new Blob([excelData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'transformed');
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }, [transformedData]);

  const reset = useCallback(() => {
    setCurrentStep(1);
    setSelectedFile(null);
    setParsedData(null);
    setTransformedData([]);
    setError('');
    setPeriodicity('');
  }, []);

  const handleCurrencyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrency(e.target.value.toUpperCase());
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Tabs */}
        <div className="mb-4 flex gap-2 justify-center">
          <button
            className={`px-4 py-2 rounded-md border ${activeTab==='single' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300'}`}
            onClick={() => { setActiveTab('single'); setCurrentStep(1); setSelectedFile(null); setParsedData(null); setParsedDataMulti(null); setTransformedData([]); setError(''); setPeriodicity(''); }}
          >
            Single entity
          </button>
          <button
            className={`px-4 py-2 rounded-md border ${activeTab==='multi' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300'}`}
            onClick={() => { setActiveTab('multi'); setCurrentStep(1); setSelectedFile(null); setParsedData(null); setParsedDataMulti(null); setTransformedData([]); setError(''); }}
          >
            Multi-entity upload
          </button>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Forecast Transformer
          </h1>
          <div className="flex justify-center space-x-4 mt-4">
            <div className={`flex items-center space-x-2 ${currentStep >= 1 ? 'text-primary-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span className="text-sm font-medium">Upload</span>
            </div>
            <div className={`flex items-center space-x-2 ${currentStep >= 2 ? 'text-primary-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="text-sm font-medium">{activeTab==='multi' ? 'Transform' : 'Configure'}</span>
            </div>
            <div className={`flex items-center space-x-2 ${currentStep >= 3 ? 'text-primary-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 3 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span className="text-sm font-medium">Download</span>
            </div>
          </div>
        </div>

        {/* Step 1: File Upload */}
        {currentStep === 1 && (
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Upload your forecast file</h2>
            <FileUpload
              onFileSelect={handleFileSelect}
              onError={setError}
            />
            
            {isProcessing && (
              <div className="mt-4 flex items-center space-x-2 text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span>Processing file...</span>
              </div>
            )}

            {error && (
              <div className="mt-4 p-4 border border-red-200 bg-red-50 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {selectedFile && ((activeTab==='single' && parsedData) || (activeTab==='multi' && parsedDataMulti)) && (
              <div className="mt-6">
                <button
                  onClick={handleContinue}
                  className="w-full btn-primary flex items-center justify-center space-x-2"
                >
                  <span>Continue</span>
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 2 */}
        {currentStep === 2 && (
          <div className="card">
            {activeTab === 'multi' ? (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Transform data</h2>
                <p className="text-sm text-gray-600 mb-6">Currency and Entity ID will be taken from the file.</p>
                <div className="flex space-x-4 mt-2">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="flex-1 btn-secondary flex items-center justify-center space-x-2"
                  >
                    <ArrowLeft className="h-5 w-5" />
                    <span>Back</span>
                  </button>
                  <button
                    onClick={handleTransform}
                    disabled={isTransforming}
                    className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {isTransforming ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <span>Transform Data</span>
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </div>
                {error && (
                  <div className="mt-4 p-4 border border-red-200 bg-red-50 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-medium text-red-800">Error</h3>
                        <p className="text-sm text-red-700 mt-1">{error}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Configure your settings</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                    <input type="text" value={currency} onChange={handleCurrencyChange} className="input-field" placeholder="SEK" maxLength={3} />
                    <p className="text-xs text-gray-500 mt-1">Enter 3-letter currency code (e.g., SEK, USD, EUR)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Parent ID</label>
                    <input type="text" value={parentId} onChange={(e) => setParentId(e.target.value)} className="input-field" placeholder="ENTITY_ID" />
                    <p className="text-sm text-gray-600 mt-2">Find your entity ID at{' '}<a href="https://app.atlar.com/entities" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 underline flex items-center space-x-1 text-base font-semibold"><span>app.atlar.com/entities</span><ExternalLink className="h-4 w-4" /></a></p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Periodicity</label>
                    <select
                      value={periodicity}
                      onChange={(e) => setPeriodicity(e.target.value)}
                      className="input-field"
                    >
                      <option value="">Select periodicity</option>
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Applies to single-entity uploads only</p>
                  </div>
                </div>
                <div className="flex space-x-4 mt-8">
                  <button onClick={() => setCurrentStep(1)} className="flex-1 btn-secondary flex items-center justify-center space-x-2"><ArrowLeft className="h-5 w-5" /><span>Back</span></button>
                  <button onClick={handleTransform} disabled={isTransforming} className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2">{isTransforming ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div><span>Processing...</span></>) : (<><span>Transform Data</span><ArrowRight className="h-5 w-5" /></>)}</button>
                </div>
                {error && (<div className="mt-4 p-4 border border-red-200 bg-red-50 rounded-lg"><div className="flex items-start space-x-3"><AlertCircle className="h-5 w-5 text-red-600 mt-0.5" /><div><h3 className="text-sm font-medium text-red-800">Error</h3><p className="text-sm text-red-700 mt-1">{error}</p></div></div></div>)}
              </>
            )}
          </div>
        )}

        {/* Step 3: Download */}
        {currentStep === 3 && (
          <div className="card">
            <div className="text-center">
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Transformation Complete!</h2>
              <p className="text-gray-600 mb-6">
                Successfully transformed {transformedData.length} records
              </p>
              
              <div className="space-y-4 mb-6">
                <button
                  onClick={handleDownload}
                  className="w-full btn-primary flex items-center justify-center space-x-2"
                >
                  <Download className="h-5 w-5" />
                  <span>Download CSV</span>
                </button>

                <button
                  onClick={handleDownloadExcel}
                  className="w-full btn-secondary flex items-center justify-center space-x-2"
                >
                  <Download className="h-5 w-5" />
                  <span>Review in Excel</span>
                </button>
              </div>

              <button
                onClick={reset}
                className="w-full btn-secondary"
              >
                Start Over
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
