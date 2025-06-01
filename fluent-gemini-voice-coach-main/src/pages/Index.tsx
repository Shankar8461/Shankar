
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mic, Play, Square, Volume2, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPlayingCorrect, setIsPlayingCorrect] = useState(false);
  const [selectedSentence, setSelectedSentence] = useState("The quick brown fox jumps over the lazy dog");
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  const practiceGeminiSentences = [
    "The quick brown fox jumps over the lazy dog",
    "How much wood would a woodchuck chuck if a woodchuck could chuck wood",
    "She sells seashells by the seashore",
    "Peter Piper picked a peck of pickled peppers",
    "I scream, you scream, we all scream for ice cream"
  ];

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size);
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder stopped, chunks:', audioChunksRef.current.length);
        
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
          console.log('Created audio blob:', audioBlob.size, 'bytes');
          
          setAudioBlob(audioBlob);
          setAudioURL(URL.createObjectURL(audioBlob));
          
          toast({
            title: "Recording complete",
            description: "Analyzing your pronunciation...",
          });
          
          // Automatically analyze the pronunciation
          await analyzePronunciationWithBlob(audioBlob);
        }
        
        // Clean up the stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            track.stop();
            console.log('Track stopped:', track.kind);
          });
          streamRef.current = null;
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        toast({
          title: "Recording Error",
          description: "Failed to record audio. Please try again.",
          variant: "destructive",
        });
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      console.log('Recording started');
      
      toast({
        title: "Recording started",
        description: "Speak the sentence clearly into your microphone",
      });
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: "Microphone Error",
        description: "Please allow microphone access to record your pronunciation",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    console.log('Stop recording called, isRecording:', isRecording);
    
    if (mediaRecorderRef.current && isRecording) {
      console.log('Stopping MediaRecorder, state:', mediaRecorderRef.current.state);
      
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        console.log('MediaRecorder stop() called');
      } else {
        console.log('MediaRecorder not in recording state:', mediaRecorderRef.current.state);
        setIsRecording(false);
      }
    } else {
      console.log('No active recording to stop');
      setIsRecording(false);
    }
  };

  const analyzePronunciationWithBlob = async (blob: Blob) => {
    setIsAnalyzing(true);
    setFeedback(null);

    try {
      console.log('Starting pronunciation analysis with blob size:', blob.size);
      
      // Convert audio blob to base64 for Gemini API
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64Audio = reader.result as string;
          const base64Data = base64Audio.split(',')[1];
          
          console.log('Sending request to Gemini API for analysis');
          
          const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=AIzaSyDn-MfoeI_GfCfyqijqQ6TdglKkCk0eIXs', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Please analyze the pronunciation of this English sentence: "${selectedSentence}". 
                      
                      Provide detailed feedback in this format:
                      
                      **Overall Accuracy**: [Score out of 10]
                      
                      **Pronunciation Issues**:
                      - [List specific mispronounced words or sounds]
                      
                      **Intonation & Fluency**:
                      - [Comments on rhythm, stress, and flow]
                      
                      **Specific Improvements**:
                      - [Actionable advice for better pronunciation]
                      
                      **Positive Points**:
                      - [What the speaker did well]
                      
                      Be encouraging but precise in your feedback.`
                    },
                    {
                      inlineData: {
                        mimeType: 'audio/webm',
                        data: base64Data
                      }
                    }
                  ]
                }
              ]
            })
          });

          const result = await response.json();
          console.log('Gemini API Response:', result);
          
          if (result.candidates && result.candidates[0]) {
            const analysisText = result.candidates[0].content.parts[0].text;
            setFeedback(analysisText);
            
            toast({
              title: "Analysis complete",
              description: "Check your pronunciation feedback below",
            });
          } else {
            console.error('No analysis received from API');
            setFeedback("Sorry, I couldn't analyze your pronunciation. Please try recording again with a clearer voice.");
            
            toast({
              title: "Analysis incomplete",
              description: "Please try recording again with clearer audio",
              variant: "destructive",
            });
          }
        } catch (apiError) {
          console.error('Error with Gemini API:', apiError);
          setFeedback("There was an error analyzing your pronunciation. Please check your internet connection and try again.");
          
          toast({
            title: "Analysis Error",
            description: "Failed to analyze pronunciation. Please try again.",
            variant: "destructive",
          });
        }
      };
      
      reader.onerror = () => {
        console.error('Error reading audio file');
        toast({
          title: "File Error",
          description: "Could not process the audio recording",
          variant: "destructive",
        });
      };
      
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Error in pronunciation analysis:', error);
      toast({
        title: "Analysis Error",
        description: "Failed to analyze pronunciation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzePronunciation = async () => {
    if (!audioBlob) {
      toast({
        title: "No Recording",
        description: "Please record your pronunciation first",
        variant: "destructive",
      });
      return;
    }
    
    await analyzePronunciationWithBlob(audioBlob);
  };

  const playCorrectPronunciation = async () => {
    setIsPlayingCorrect(true);
    
    try {
      console.log('Generating correct pronunciation for:', selectedSentence);
      
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=AIzaSyD1B4VJDBHkGD6NQNcXXJHXRKhnpbB0twU', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Please generate clear, native-level English pronunciation for: "${selectedSentence}". Speak slowly and clearly with proper intonation.`
                }
              ]
            }
          ],
          generationConfig: {
            response_modalities: ["AUDIO"]
          }
        })
      });

      const result = await response.json();
      console.log('TTS API Response:', result);
      
      if (result.candidates && result.candidates[0] && result.candidates[0].content.parts[0].inlineData) {
        const audioData = result.candidates[0].content.parts[0].inlineData.data;
        const audioBlob = new Blob([new Uint8Array(atob(audioData).split('').map(char => char.charCodeAt(0)))], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        const audio = new Audio(audioUrl);
        audio.onended = () => setIsPlayingCorrect(false);
        audio.onerror = () => {
          console.error('Error playing Gemini-generated audio');
          fallbackToWebSpeech();
        };
        await audio.play();
        
        toast({
          title: "Playing correct pronunciation",
          description: "Listen carefully and try to match this pronunciation",
        });
      } else {
        console.log('No audio data from Gemini, using fallback');
        fallbackToWebSpeech();
      }
    } catch (error) {
      console.error('Error playing correct pronunciation:', error);
      fallbackToWebSpeech();
    }
  };

  const fallbackToWebSpeech = () => {
    // Fallback to Web Speech API
    const utterance = new SpeechSynthesisUtterance(selectedSentence);
    utterance.rate = 0.7;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = () => setIsPlayingCorrect(false);
    speechSynthesis.speak(utterance);
    
    toast({
      title: "Using browser TTS",
      description: "Playing pronunciation using browser text-to-speech",
    });
  };

  const resetSession = () => {
    // Stop any ongoing recording
    if (isRecording) {
      stopRecording();
    }
    
    // Clean up audio URLs
    if (audioURL) {
      URL.revokeObjectURL(audioURL);
    }
    
    setAudioBlob(null);
    setAudioURL(null);
    setFeedback(null);
    setIsRecording(false);
    setIsAnalyzing(false);
    setIsPlayingCorrect(false);
    
    toast({
      title: "Session reset",
      description: "Ready for a new pronunciation practice",
    });
  };

  const playUserRecording = () => {
    if (audioURL) {
      const audio = new Audio(audioURL);
      audio.play().catch(error => {
        console.error('Error playing user recording:', error);
        toast({
          title: "Playback Error",
          description: "Could not play your recording",
          variant: "destructive",
        });
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
            AI Pronunciation Trainer
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Improve your English pronunciation with AI-powered feedback. Record yourself speaking and get instant analysis.
          </p>
        </div>

        {/* Sentence Selection */}
        <Card className="mb-8 border-2 border-blue-100 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl text-blue-700 flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Practice Sentence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {practiceGeminiSentences.map((sentence, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setSelectedSentence(sentence);
                    resetSession();
                  }}
                  className={`p-4 text-left rounded-lg border-2 transition-all ${
                    selectedSentence === sentence
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-blue-25'
                  }`}
                >
                  {sentence}
                </button>
              ))}
            </div>
            
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white">
              <h3 className="font-semibold mb-2">Current Practice Sentence:</h3>
              <p className="text-lg">{selectedSentence}</p>
            </div>
          </CardContent>
        </Card>

        {/* Recording Section */}
        <Card className="mb-8 border-2 border-green-100 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl text-green-700 flex items-center gap-2">
              <Mic className="h-5 w-5" />
              Record Your Pronunciation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center space-y-6">
              <div className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
                isRecording 
                  ? 'bg-red-500 animate-pulse shadow-lg shadow-red-300' 
                  : 'bg-gradient-to-br from-green-400 to-blue-500 hover:shadow-lg hover:shadow-green-300'
              }`}>
                <Mic className={`h-12 w-12 text-white ${isRecording ? 'animate-bounce' : ''}`} />
                {isRecording && (
                  <div className="absolute -inset-4 rounded-full border-4 border-red-300 animate-ping"></div>
                )}
              </div>

              <div className="flex gap-4">
                {!isRecording ? (
                  <Button 
                    onClick={startRecording}
                    size="lg"
                    className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                    disabled={isAnalyzing}
                  >
                    <Mic className="h-4 w-4 mr-2" />
                    Start Recording
                  </Button>
                ) : (
                  <Button 
                    onClick={stopRecording}
                    size="lg"
                    variant="destructive"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop Recording
                  </Button>
                )}

                {audioURL && !isRecording && (
                  <Button 
                    onClick={playUserRecording}
                    size="lg"
                    variant="outline"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Play Recording
                  </Button>
                )}
              </div>

              {isAnalyzing && (
                <div className="text-center">
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                    <div className="h-3 w-3 mr-2 animate-spin rounded-full border-2 border-yellow-600 border-t-transparent"></div>
                    Analyzing Pronunciation...
                  </Badge>
                </div>
              )}

              {audioBlob && !isAnalyzing && (
                <div className="text-center">
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    Recording Ready - Analysis {feedback ? 'Complete' : 'Pending'}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Analysis Section */}
        {(audioBlob || feedback) && (
          <Card className="mb-8 border-2 border-purple-100 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl text-purple-700">AI Analysis & Feedback</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center space-y-6">
                {!feedback && !isAnalyzing && (
                  <Button 
                    onClick={analyzePronunciation}
                    size="lg"
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    Analyze Pronunciation
                  </Button>
                )}

                {feedback && (
                  <div className="w-full p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                    <h3 className="font-semibold text-purple-700 mb-3">AI Feedback:</h3>
                    <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {feedback}
                    </div>
                  </div>
                )}

                <Button 
                  onClick={playCorrectPronunciation}
                  disabled={isPlayingCorrect}
                  size="lg"
                  variant="outline"
                  className="border-purple-300 text-purple-600 hover:bg-purple-50"
                >
                  {isPlayingCorrect ? (
                    <>
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
                      Playing...
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-4 w-4 mr-2" />
                      Hear Correct Pronunciation
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
        </Card>
        )}

        {/* Reset Button */}
        <div className="text-center">
          <Button 
            onClick={resetSession}
            variant="outline"
            size="lg"
            className="border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Start New Session
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
