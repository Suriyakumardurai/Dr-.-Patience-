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
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const accessToken = auth.user?.access_token;

  const authHeader = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  const loadSessions = async () => {
    try {
      const res = await axios.get(`http://localhost:8000/sessions`, authHeader);
      setSessions(res.data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const startSession = async () => {
    try {
      const res = await axios.post('http://localhost:8000/start', {}, authHeader);
      const newSessionId = res.data.session_id;
      setSessionId(newSessionId);
      setChatHistory([]);
      localStorage.setItem('currentSessionId', newSessionId);
      await loadSessions();
      setSidebarVisible(false);
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  const loadSession = async (id) => {
    try {
      setSessionId(id);
      localStorage.setItem('currentSessionId', id);
      const res = await axios.get(`http://localhost:8000/history/${id}`, authHeader);
      setChatHistory(res.data.history || []);
      setSidebarVisible(false);
    } catch (err) {
      console.error('Failed to load session history:', err);
    }
  };

  const confirmDeleteSession = (id) => {
    setPendingDeleteId(id);
    setShowDeleteModal(true);
  };

  const deleteSession = async () => {
    try {
      await axios.delete(`http://localhost:8000/session/${pendingDeleteId}`, authHeader);
      await loadSessions();
      if (pendingDeleteId === sessionId) {
        setSessionId('');
        setChatHistory([]);
        localStorage.removeItem('currentSessionId');
      }
      setPendingDeleteId(null);
      setShowDeleteModal(false);
    } catch (err) {
      console.error('Failed to delete session:', err);
      alert('Error deleting session.');
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !sessionId) return;

    const userMsg = { role: 'user', content: input };
    setChatHistory((prev) => [...prev, userMsg]);
    setInput('');

    try {
      const res = await axios.post(
        'http://localhost:8000/chat',
        {
          session_id: sessionId,
          user_input: input,
        },
        authHeader
      );

      const botMsg = { role: 'assistant', content: res.data.response };
      setChatHistory((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error('Chat error:', err);
      alert('Something went wrong while sending your message.');
    }
  };

  useEffect(() => {
    const chatBox = document.querySelector('.chat-box');
    if (chatBox) chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    if (auth.isAuthenticated) {
      const initialize = async () => {
        await loadSessions();
        const savedSessionId = localStorage.getItem('currentSessionId');
        if (savedSessionId) {
          await loadSession(savedSessionId);
        } else {
          await startSession();
        }
      };
      initialize();
    }
  }, [auth.isAuthenticated]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.sidebar') && !e.target.closest('.hamburger')) {
        setSidebarVisible(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const signOutRedirect = async () => {
    localStorage.removeItem('currentSessionId');
    await auth.removeUser();
    const clientId = '2mgl2q0crrj8a9eva5sbj1bi12';
    const logoutUri = 'http://localhost:3000';
    const cognitoDomain = 'https://ap-south-1pirqyrdb1.auth.ap-south-1.amazoncognito.com';
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  if (auth.isLoading) return <div>Loading authentication...</div>;
  if (auth.error) return <div>Error: {auth.error.message}</div>;

  if (!auth.isAuthenticated) {
    return (
      <div className="App">
        <h1>🩺 AI Doctor Chat</h1>
        <p>Please sign in to use the chat.</p>
        <button onClick={() => auth.signinRedirect()}>🔐 Sign in with Cognito</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarVisible ? 'visible' : ''}`}>
        <h2>💬 Chats</h2>
        <button className="new-chat" onClick={startSession}>
          ➕ New Chat
        </button>
        <div className="session-list">
          {[...sessions].reverse().map((s) => (
            <div key={s.id} className={`session-item ${s.id === sessionId ? 'active' : ''}`}>
              <span onClick={() => loadSession(s.id)} className="session-title">
                {s.title || `Session ${s.id.slice(0, 5)}`}
              </span>
              <button
                className="delete-button"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDeleteSession(s.id);
                }}
                title="Delete"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
        <button className="signout" onClick={signOutRedirect}>
          🚪 Sign out
        </button>
      </div>

      {/* Chat Area */}
      <div className="chat-area">
        <div className="chat-header">
          <button className="hamburger" onClick={() => setSidebarVisible((prev) => !prev)}>
            ☰
          </button>
          <h1>🩺 AI Doctor</h1>
          <p className="user-email">👋 {auth.user?.profile?.email}</p>
        </div>

        <div className="chat-box">
          {[...chatHistory]
            .filter((m) => m.role !== 'system')
            .reverse()
            .map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role === 'user' ? 'user-message' : 'bot-message'}`}>
                <div className="message-bubble">
                  <strong>{msg.role === 'user' ? '👤 You' : '🤖 Doctor'}:</strong> {msg.content}
                </div>
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Delete Chat</h3>
            <p>Are you sure you want to delete this session?</p>
            <div className="modal-actions">
              <button className="confirm" onClick={deleteSession}>
                Yes, delete
              </button>
              <button className="cancel" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
