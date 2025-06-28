import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from 'react-oidc-context';
import './App.css';

export default function App() {
  const auth = useAuth();

  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [input, setInput] = useState('');

  const accessToken = auth.user?.access_token;

  const authHeader = {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  };

  // Load all sessions
  const loadSessions = async () => {
    try {
      const res = await axios.get(`http://localhost:8000/sessions`, authHeader);
      setSessions(res.data);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  };

  // Start a new session
  const startSession = async () => {
    try {
      const res = await axios.post('http://localhost:8000/start', {}, authHeader);
      const newSessionId = res.data.session_id;
      setSessionId(newSessionId);
      setChatHistory([]);
      localStorage.setItem("currentSessionId", newSessionId);
      await loadSessions();
    } catch (err) {
      console.error("Failed to start session:", err);
    }
  };

  // Load existing session
  const loadSession = async (id) => {
    try {
      setSessionId(id);
      localStorage.setItem("currentSessionId", id);
      const res = await axios.get(`http://localhost:8000/history/${id}`, authHeader);
      setChatHistory(res.data.history);
    } catch (err) {
      console.error("Failed to load session history:", err);
    }
  };

  // Send a user message
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input || !sessionId) return;

    const userMsg = { role: 'user', content: input };
    setChatHistory(prev => [...prev, userMsg]);
    setInput('');

    try {
      const res = await axios.post('http://localhost:8000/chat', {
        session_id: sessionId,
        user_input: input
      }, authHeader);

      const botMsg = { role: 'assistant', content: res.data.response };
      setChatHistory(prev => [...prev, botMsg]);
    } catch (err) {
      console.error("Chat error:", err);
      alert("Something went wrong while sending your message.");
    }
  };

  // Scroll chat to bottom on update
  useEffect(() => {
    const chatBox = document.querySelector('.chat-box');
    chatBox?.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
  }, [chatHistory]);

  // Load sessions + current session (on login)
  useEffect(() => {
    if (auth.isAuthenticated) {
      const initialize = async () => {
        await loadSessions();
        const savedSessionId = localStorage.getItem("currentSessionId");

        if (savedSessionId) {
          await loadSession(savedSessionId); // Restore previous session
        } else {
          await startSession(); // Fresh login → new session
        }
      };

      initialize();
    }
  }, [auth.isAuthenticated]);

  // Logout and clear local session
  const signOutRedirect = async () => {
    localStorage.removeItem("currentSessionId");
    await auth.removeUser();
    const clientId = "2mgl2q0crrj8a9eva5sbj1bi12";
    const logoutUri = "http://localhost:3000";
    const cognitoDomain = "https://ap-south-1pirqyrdb1.auth.ap-south-1.amazoncognito.com";
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  // Authentication states
  if (auth.isLoading) return <div>Loading authentication...</div>;
  if (auth.error) return <div>Error: {auth.error.message}</div>;

  // Not signed in
  if (!auth.isAuthenticated) {
    return (
      <div className="App">
        <h1>🩺 AI Doctor Chat</h1>
        <p>Please sign in to use the chat.</p>
        <button onClick={() => auth.signinRedirect()}>🔐 Sign in with Cognito</button>
      </div>
    );
  }

  // Authenticated UI
  return (
    <div className="App">
      <h1>🩺 AI Doctor Chat</h1>

      <div className="controls">
        <p>👋 Welcome, <strong>{auth.user?.profile?.email}</strong></p>

        <button onClick={startSession}>➕ Start New Chat</button>

        <select onChange={(e) => loadSession(e.target.value)} value={sessionId}>
          <option value="">📁 Select a Session</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>

        <button onClick={signOutRedirect}>🚪 Sign out</button>
      </div>

      <div className="chat-box">
        {chatHistory
          .filter(m => m.role !== 'system')
          .map((msg, idx) => (
            <div key={idx} className={msg.role === 'user' ? 'user' : 'bot'}>
              <p><strong>{msg.role === 'user' ? '👤 You' : '🤖 Doctor'}:</strong> {msg.content}</p>
            </div>
          ))}
      </div>

      <form className="input-box" onSubmit={sendMessage}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your symptoms..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
