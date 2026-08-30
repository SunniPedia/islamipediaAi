'use client'
import { useState } from 'react'

export default function Home() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if(!input) return
    const userMsg = { role: 'user', content: input }
    setMessages([...messages, userMsg])
    setInput("")
    setLoading(true)
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ question: userMsg.content })
    })
    const data = await res.json()
    setMessages(prev => [...prev, { role: 'ai', content: data.answer }])
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center font-sans">
      <div className="w-full max-w-[800px] p-6 pb-32">
        <h1 className="text-[40px] font-bold text-center">Ask <span style={{color: '#0F7A4F'}}>islamiPedia AI</span></h1>
        <p className="text-center opacity-60">Your trusted companion for Islamic knowledge</p>
        <div className="mt-8 space-y-4">
          {messages.map((m,i) => (
            <div key={i} className={`p-4 rounded-[20px] whitespace-pre-wrap ${m.role==='user'? 'bg-[#0F7A4F] text-white ml-auto max-w-[80%]' : 'bg-white border max-w-[90%]'}`}>
              {m.content}
            </div>
          ))}
          {loading && <div className="opacity-50">চিন্তা করছি...</div>}
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
        <div className="max-w-[800px] mx-auto flex gap-2">
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSend()} placeholder="Ask anything about Islam..." className="flex-1 px-5 py-3 rounded-full border outline-none" />
          <button onClick={handleSend} className="px-6 py-3 bg-[#0F7A4F] text-white rounded-full">Send</button>
        </div>
        <p className="text-center text-[11px] opacity-40 mt-2">islamiPedia AI can make mistakes. Verify with trusted scholars.</p>
      </div>
    </div>
  )
}
