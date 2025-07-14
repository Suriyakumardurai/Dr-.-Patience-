import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from 'react-oidc-context';
import './App.css';
import DoctorBubble from './DoctorBubble';
import UserBubble from './UserBubble';
import { FaUserMd } from 'react-icons/fa';

export default function App() {
  const auth = useAuth();

  // ---------- CONSTANTS ----------
  const API_BASE   = 'https://doctorai.duckdns.org/api';
  const LOGOUT_URI = 'https://doctorai.duckdns.org';
  const clientId   = '2mgl2q0crrj8a9eva5sbj1bi12'; // <- your Cognito App Client ID
  const cognitoDomain =
    'https://ap-south-1pirqyrdb1.auth.ap-south-1.amazoncognito.com';

  // ---------- STATE ----------
  const [sessionId,        setSessionId]        = useState('');
  const [sessions,         setSessions]         = useState([]);
  const [chatHistory,      setChatHistory]      = useState([]);
  const [input,            setInput]            = useState('');
  const [sidebarVisible,   setSidebarVisible]   = useState(false);
  const [showDeleteModal,  setShowDeleteModal]  = useState(false);
  const [pendingDeleteId,  setPendingDeleteId]  = useState(null);

  // ---------- AUTH HEADER ----------
  const accessToken = auth.user?.access_token;
  const authHeader  = { headers: { Authorization: `Bearer ${accessToken}` } };

  // ---------- API HELPERS ----------
  const loadSessions = async () => {
    try {
      const res = await axios.get(`${API_BASE}/sessions`, authHeader);
      setSessions(res.data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const startSession = async () => {
    try {
      const res          = await axios.post(`${API_BASE}/start`, {}, authHeader);
      const newSessionId = res.data.session_id;
      setSessionId(newSessionId);
      setChatHistory([]);
      localStorage.setItem('currentSessionId', newSessionId);
      await loadSessions();
      await loadSession(newSessionId);
      setSidebarVisible(false);
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  const loadSession = async (id) => {
    try {
      setSessionId(id);
      localStorage.setItem('currentSessionId', id);
      const res = await axios.get(`${API_BASE}/history/${id}`, authHeader);
      setChatHistory(res.data.history || []);
      setSidebarVisible(false);
    } catch (err) {
      console.error('Failed to load session history:', err);
    }
  };

  const deleteSession = async () => {
    try {
      await axios.delete(`${API_BASE}/session/${pendingDeleteId}`, authHeader);
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
        `${API_BASE}/chat`,
        { session_id: sessionId, user_input: input },
        authHeader
      );
      const botMsg = { role: 'assistant', content: res.data.response };
      setChatHistory((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error('Chat error:', err);
      alert('Something went wrong while sending your message.');
    }
  };

  // ---------- EFFECTS ----------
  useEffect(() => {
    const chatBox = document.querySelector('.chat-box');
    if (chatBox) chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    if (auth.isAuthenticated) {
      const initialize = async () => {
        await loadSessions();
        const savedId = localStorage.getItem('currentSessionId');
        savedId ? await loadSession(savedId) : await startSession();
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

  // ---------- LOGOUT ----------
  const signOutRedirect = async () => {
    localStorage.removeItem('currentSessionId');
    await auth.removeUser();
    window.location.href =
      `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(LOGOUT_URI)}`;
  };

  // ---------- RENDER LOGIC ----------
  if (auth.isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p className="loading-text">Logging you in Securely...</p>
      </div>
    );
  }

  if (auth.error) return <div>Error: {auth.error.message}</div>;

  if (!auth.isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-icon"><FaUserMd /></div>
          <h1>🩺 Welcome to Dr. Patience AI Clinic</h1>
          <p>Please sign in to begin your consultation.</p>
          <button onClick={() => auth.signinRedirect()} className="login-button">
            🔐 Sign in with Cognito
          </button>
          <p className="login-footer">
            Secure consultations available between <strong>12 PM – 12 AM IST</strong>.
          </p>
        </div>
      </div>
    );
  }

  // ---------- MAIN UI ----------
  return (
    <div className="app-container">

      {/* ------ Sidebar ------ */}
      <div className={`sidebar ${sidebarVisible ? 'visible' : ''}`}>
        <h2>💬 Chats</h2>
        <button className="new-chat" onClick={startSession}>➕ New Chat</button>

        <div className="session-list">
          {[...sessions].reverse().map((s) => (
            <div key={s.id} className={`session-item ${s.id === sessionId ? 'active' : ''}`}>
              <span onClick={() => loadSession(s.id)} className="session-title">
                {s.title || `Session ${s.id.slice(0, 5)}`}
              </span>
              <button
                className="delete-button"
                title="Delete"
                onClick={(e) => { e.stopPropagation(); setPendingDeleteId(s.id); setShowDeleteModal(true); }}
              >
                🗑️
              </button>
            </div>
          ))}
        </div>

        <button className="signout" onClick={signOutRedirect}>🚪 Sign out</button>
      </div>

      {/* ------ Chat Area ------ */}
      <div className="chat-area">
        <div className="chat-header">
          <button className="hamburger" onClick={() => setSidebarVisible((prev) => !prev)}>☰</button>
          <h1>🩺 AI Doctor</h1>
          <p className="user-email">👋 {auth.user?.profile?.email}</p>
        </div>

        <div className="chat-box">
          {[...chatHistory]
            .filter((m) => m.role !== 'system')
            .reverse()
            .map((msg, idx) =>
              msg.role === 'user'
                ? <UserBubble   key={idx} content={msg.content} />
                : <DoctorBubble key={idx} content={msg.content} />
            )}
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

      {/* ------ Delete Modal ------ */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Delete Chat</h3>
            <p>Are you sure you want to delete this session?</p>
            <div className="modal-actions">
              <button className="confirm" onClick={deleteSession}>Yes, delete</button>
              <button className="cancel"  onClick={() => setShowDeleteModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
