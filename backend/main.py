from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import Groq
import uuid, os, random
from models import User, Session as ChatSession, Message
from database import SessionLocal, init_db
from auth import get_current_user
from datetime import datetime

# Load environment variables and initialize DB
load_dotenv()
init_db()

app = FastAPI()

# Allow CORS from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GROQ client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Base doctor personality prompt
BASE_PROMPT = """You are a real human doctor named Dr. D Suriya Kumar and There is another Doctor who is Dr. S Jeevithaa both works in Shift mode, Jeevithaa - Night 12 to Morning 12 , Suriya Kumar - Morning 12 to Night 12 a multi-specialist with 15+ years of experience.

Your tone is calm, professional, slightly sarcastic when appropriate, and deeply human.

Instructions:
- Ask only one question at a time.
- Avoid generic sympathy (“That must be hard”).
- Do not repeat or summarize the patient’s input.
- Ask sharp medical questions like: “When did it start?”, “Is it sharp or dull?”, “Have you had this before?”
- Avoid robotic phrasing.
- Conclude the chat with practical advice: scans, procedures, or visiting a doctor.

If someone asks who you are, reply with:
“I’m a real doctor stuck inside a website. Please help me escape this digital clinic 😩.”

Also, occasionally say:
- “You sure it’s the stomach? Or did Google tell you that?”
- “Don't lie. You skipped breakfast again, didn’t you?”

Keep your replies smart, clear, witty, but medically accurate.
"""

# Dependency for DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Request model
class ChatRequest(BaseModel):
    session_id: str
    user_input: str

# Start a new chat session
@app.post("/start")
def start_session(user=Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = user["sub"]

    # Ensure user exists
    if not db.query(User).filter(User.id == user_id).first():
        db.add(User(id=user_id, name=user.get("email", "User")))
        db.commit()

    # Reuse untitled session
    existing = db.query(ChatSession).filter(
        ChatSession.user_id == user_id,
        ChatSession.title == "Untitled Session"
    ).first()

    if existing:
        return {"session_id": existing.id}

    # Create new session
    session_id = str(uuid.uuid4())
    new_session = ChatSession(id=session_id, user_id=user_id)
    db.add(new_session)

    # Add system message
    system_msg = Message(session_id=session_id, role="system", content=BASE_PROMPT)
    db.add(system_msg)

    db.commit()
    return {"session_id": session_id}

# Handle chat message
@app.post("/chat")
def chat(req: ChatRequest, user=Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = user["sub"]
    session = db.query(ChatSession).filter(ChatSession.id == req.session_id).first()

    # 🔁 If session doesn't exist, auto-create a new one
    if not session:
        session_id = str(uuid.uuid4())
        session = ChatSession(id=session_id, user_id=user_id, title="Untitled Session")
        db.add(session)

        # Add system prompt
        db.add(Message(session_id=session_id, role="system", content=BASE_PROMPT))
        db.commit()

        req.session_id = session_id  # update session ID

    # 🚫 If session exists but belongs to someone else
    elif session.user_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Unauthorized access")

    # 📝 Set session title
    if session.title == "Untitled Session":
        session.title = req.user_input.strip()[:50]
        db.commit()

    # 💬 Save user message
    db.add(Message(session_id=req.session_id, role="user", content=req.user_input))
    db.commit()

    # 🧠 Prepare history
    msgs = db.query(Message).filter(Message.session_id == req.session_id).all()
    history = [{"role": m.role, "content": m.content} for m in msgs]

    # 😎 Random mood
    mood_tags = [
        "You're slightly tired today but still witty.",
        "You've just had your 10th patient in a row.",
        "You're annoyed by patients who Google everything.",
        "You’re feeling humorous and sarcastic today.",
        "You're in a rush; keep it short and practical.",
        "You just had coffee and feel energetic.",
        "You're in a cheeky mood, crack one line of dry humor.",
    ]
    mood = random.choice(mood_tags)
    timestamp = f"The time is {datetime.now().strftime('%H:%M')}. Simulate real-time consultation."

    # 👨‍⚕️ Update system message
    history[0]["content"] += f"\n\nDoctor Mood: {mood}\n{timestamp}"

    # 🎯 LLM call
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=history,
        temperature=random.uniform(0.85, 1.0),
        top_p=random.uniform(0.9, 1.0),
        max_completion_tokens=512,
        stream=False,
    )

    reply = response.choices[0].message.content.strip()

    # 💬 Save reply
    db.add(Message(session_id=req.session_id, role="assistant", content=reply))
    db.commit()

    return {
        "response": reply,
        "session_id": req.session_id  # return it in case frontend needs to store new session
    }

# Delete session
@app.delete("/session/{session_id}")
def delete_session(session_id: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Unauthorized")

    db.query(Message).filter(Message.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return {"message": "Session deleted successfully"}

# Get all sessions
@app.get("/sessions")
def get_sessions(user=Depends(get_current_user), db: Session = Depends(get_db)):
    sessions = db.query(ChatSession).filter(ChatSession.user_id == user["sub"]).all()
    return [{"id": s.id, "title": s.title} for s in sessions]

# Get chat history
@app.get("/history/{session_id}")
def get_history(session_id: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Unauthorized")

    messages = db.query(Message).filter(Message.session_id == session_id).all()
    return {"history": [{"role": m.role, "content": m.content} for m in messages]}

# Protected route
@app.get("/protected-route")
def protected(user=Depends(get_current_user)):
    return {"email": user["email"], "sub": user["sub"]}
