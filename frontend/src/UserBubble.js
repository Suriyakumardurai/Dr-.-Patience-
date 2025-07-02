// UserBubble.js
import React from 'react';
import './UserBubble.css'; // optional for custom styles

export default function UserBubble({ content }) {
  return (
    <div className="chat-message user-message">
      <div className="message-bubble user-bubble">
        <strong>👤 You:</strong> {content}
      </div>
    </div>
  );
}
