// DoctorBubble.jsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './DoctorBubble.css';

export default function DoctorBubble({ content }) {
  return (
    <div className="bot-message doctor-bubble">
      <div className="message-bubble formatted-doctor-response">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
