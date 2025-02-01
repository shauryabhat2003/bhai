import { useEffect, useRef, useState } from "react";
import "./newPrompt.css";
import Upload from "../upload/Upload";
import { IKImage } from "imagekitio-react";
import model from "../../lib/gemini";
import Markdown from "react-markdown";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const NewPrompt = ({ data }) => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatInitialized, setChatInitialized] = useState(false);
  const chatInstance = useRef(null);
  const hasRun = useRef(false);
  const endRef = useRef(null);
  const formRef = useRef(null);
  const [img, setImg] = useState({
    isLoading: false,
    error: "",
    dbData: {},
    aiData: {},
  });

  // Initialize chat
  useEffect(() => {
    if (!data?._id || chatInitialized) return;

    try {
      const initialHistory = [{
        role: "user",
        parts: [{ text: data?.history?.[0]?.parts?.[0]?.text || "Hello" }]
      }];

      chatInstance.current = model.startChat({
        history: initialHistory,
        generationConfig: { temperature: 0.9 }
      });
      
      setChatInitialized(true);
    } catch (error) {
      console.error("Chat initialization error:", error);
    }
  }, [data?._id, chatInitialized]);

  // Handle first message
  useEffect(() => {
    if (!hasRun.current && chatInitialized && data?.history?.length === 1) {
      const initialMessage = data.history[0].parts[0]?.text;
      if (initialMessage) {
        hasRun.current = true;
        add(initialMessage, true);
      }
    }
  }, [data, chatInitialized]);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [data, question, answer, img.dbData]);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      return fetch(`${import.meta.env.VITE_API_URL}/api/chats/${data._id}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: question.length ? question : undefined,
          answer,
          img: img.dbData?.filePath || undefined,
        }),
      }).then((res) => res.json());
    },
    onSuccess: () => {
      queryClient
        .invalidateQueries({ queryKey: ["chat", data._id] })
        .then(() => {
          formRef.current.reset();
          setQuestion("");
          setAnswer("");
          setImg({
            isLoading: false,
            error: "",
            dbData: {},
            aiData: {},
          });
        });
    },
    onError: (err) => {
      console.log(err);
    },
  });

  const add = async (text, isInitial = false) => {
    if (!text || !chatInstance.current) {
      console.error("Missing text or chat not initialized");
      return;
    }

    setLoading(true);
    if (!isInitial) setQuestion(text);

    try {
      const result = await chatInstance.current.sendMessageStream(
        Object.keys(img.aiData).length ? [img.aiData, text] : text
      );

      let accumulatedText = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        accumulatedText += chunkText;
        setAnswer(accumulatedText);
      }

      if (!isInitial) {
        mutation.mutate();
      }
    } catch (err) {
      console.error("Chat error:", err);
      setAnswer("Sorry, there was an error processing your request.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = e.target.text.value;
    if (!text) return;
    add(text, false);
  };

  return (
    <>
      {img.isLoading && <div className="">Loading...</div>}
      {img.dbData?.filePath && (
        <IKImage
          urlEndpoint={import.meta.env.VITE_IMAGE_KIT_ENDPOINT}
          path={img.dbData?.filePath}
          width="380"
          transformation={[{ width: 380 }]}
        />
      )}
      {question && <div className="message user">{question}</div>}
      {answer && (
        <div className="message">
          <Markdown>{answer}</Markdown>
        </div>
      )}
      <div className="endChat" ref={endRef}></div>
      <form className="newForm" onSubmit={handleSubmit} ref={formRef}>
        <Upload setImg={setImg} />
        <input id="file" type="file" multiple={false} hidden />
        <input type="text" name="text" placeholder="Ask anything..." />
        <button>
          <img src="/arrow.png" alt="" />
        </button>
      </form>
    </>
  );
};

export default NewPrompt;