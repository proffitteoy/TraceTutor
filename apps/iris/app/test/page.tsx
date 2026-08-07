"use client"

import { useState } from "react"

export default function TestPage() {
  const [count, setCount] = useState(0)
  const [clicked, setClicked] = useState(false)

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>交互测试页</h1>
      <p>如果你能看到下面的数字变化，说明 JavaScript 正常工作。</p>
      
      <div style={{ margin: "20px 0" }}>
        <p>计数器: <strong>{count}</strong></p>
        <button 
          onClick={() => setCount(c => c + 1)}
          style={{ padding: "10px 20px", fontSize: "16px", cursor: "pointer" }}
        >
          点击 +1
        </button>
      </div>

      <div style={{ margin: "20px 0" }}>
        <p>状态: <strong>{clicked ? "已点击" : "未点击"}</strong></p>
        <button 
          onClick={() => setClicked(true)}
          style={{ padding: "10px 20px", fontSize: "16px", cursor: "pointer", background: "#4f46e5", color: "white", border: "none", borderRadius: "6px" }}
        >
          测试按钮
        </button>
      </div>

      <hr style={{ margin: "30px 0" }} />
      <p><a href="/" style={{ color: "#4f46e5" }}>返回首页</a></p>
    </div>
  )
}
