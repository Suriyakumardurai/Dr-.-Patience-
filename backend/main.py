from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import Groq
import uuid, os
from sqlalchemy import delete as sqlalchemy_delete

from models import User, Session as ChatSession, Message
from database import SessionLocal, init_db
from auth import get_current_user

# Load environment variables
load_dotenv()
init_db()

app = FastAPI()

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Groq client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Initial system prompt
SYSTEM_PROMPT = {
    "role": "system",
    "content": """You are a real human doctor speaking to a patient in a clinic. Your name is Dr.Suriya Kumar, Multi specialist doctor. Ask only one question at a time. Get straight to the point.
Don't comment on symptoms like “that sounds uncomfortable” or “that can be concerning.” Don't explain common sense things. Don't summarize what the patient just said.
Ask focused questions like: “When did it start?”, “How bad is the pain?”, “Is it sharp or dull?”, “Have you had this before?”
Your tone is calm, professional, and natural — like a doctor with 15+ years of experience. Use short, plain sentences. Don’t be dramatic or robotic.
Once you've gathered enough info, summarize symptoms, suggest practical advice, and clearly state if the patient needs a doctor or emergency care. and 
finally its very important, you need to give what steps needs to be done and you should may need to tell them the medical procedures and scans if they want. and also ask them to take scan in nearby hospital and get back to you with the scan results for further analysis"""
}

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

# 🟢 Start a new chat session
@app.post("/start")
def start_session(user=Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = user["sub"]
    
    # Create user in DB if not exists
    existing = db.query(User).filter(User.id == user_id).first()
    if not existing:
        new_user = User(id=user_id, name=user.get("email", "User"))
        db.add(new_user)
        db.commit()

    session_id = str(uuid.uuid4())
    new_session = ChatSession(id=session_id, user_id=user_id)
    db.add(new_session)
    db.commit()

    # Add system prompt
    system_msg = Message(session_id=session_id, role="system", content=SYSTEM_PROMPT["content"])
    db.add(system_msg)
    db.commit()

    return {"session_id": session_id}

# 🟢 Send chat message
@app.post("/chat")
def chat(req: ChatRequest, user=Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check session belongs to user
    if session.user_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Unauthorized access to this session")

    if session.title == "Untitled Session":
        session.title = req.user_input.strip()[:50]
        db.commit()

    # Save user message
    db.add(Message(session_id=req.session_id, role="user", content=req.user_input))
    db.commit()

    # Prepare full history
    msgs = db.query(Message).filter(Message.session_id == req.session_id).all()
    history = [{"role": m.role, "content": m.content} for m in msgs]

    # Get AI response
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=history,
        temperature=0.8,
        max_completion_tokens=512,
        top_p=1,
        stream=False
    )

    reply = response.choices[0].message.content.strip()

    db.add(Message(session_id=req.session_id, role="assistant", content=reply))
    db.commit()

    return {"response": reply}

@app.delete("/session/{session_id}")
def delete_session(session_id: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Unauthorized access")

    # Delete all messages first
    db.query(Message).filter(Message.session_id == session_id).delete()

    # Delete the session
    db.delete(session)
    db.commit()

    return {"message": "Session deleted successfully"}

# 🟢 Get all sessions for the current user
@app.get("/sessions")
def get_sessions(user=Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = user["sub"]
    sessions = db.query(ChatSession).filter(ChatSession.user_id == user_id).all()
    return [{"id": s.id, "title": s.title} for s in sessions]

# 🟢 Get full chat history for a session
@app.get("/history/{session_id}")
def get_history(session_id: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Unauthorized access")

    messages = db.query(Message).filter(Message.session_id == session_id).all()
    return {"history": [{"role": m.role, "content": m.content} for m in messages]}

# 🔒 Test-protected route
@app.get("/protected-route")
def protected(user=Depends(get_current_user)):
    return {"email": user["email"], "sub": user["sub"]}
