import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [input, setInput] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [output, setOutput] = useState('')
  const [generatedOutput, setGeneratedOutput] = useState(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [showToast, setShowToast] = useState(false)
  const [navToast, setNavToast] = useState(false)
  const [navToastMessage, setNavToastMessage] = useState('')

  function showNavDemoToast(msg = 'Demo navigation only') {
    setNavToastMessage(msg)
    setNavToast(true)
    setTimeout(() => setNavToast(false), 3000)
  }

  const API_BASE = 'http://localhost:5001/agent'

  useEffect(() => {
    if (analysis) {
      setShowToast(true)
      setTimeout(() => setShowToast(false), 4000)
    }
  }, [analysis])

  async function analyzeFlow() {
    setLoading(true)
    setStatus('Analyzing flow...')
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualTestCase: input }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setAnalysis(data || null)
      setOutput('')
      setStatus('Analysis complete')
    } catch (err) {
      console.error(err)
      setStatus('Analysis failed: ' + err.message)
      setAnalysis(null)
    } finally {
      setLoading(false)
    }
  }

  async function generate(kind) {
    if (!analysis && kind !== 'postman') { setStatus('Please analyze the flow first'); return }
    setLoading(true)
    setStatus(`Generating ${kind}...`)
    try {
      let endpoint = `${API_BASE}/generate/${kind}`
      if (kind === 'postman') endpoint = `${API_BASE}/generate-postman`
      if (kind === 'playwright') endpoint = `${API_BASE}/generate-playwright`
      if (kind === 'jmeter') endpoint = `${API_BASE}/generate-jmeter`

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: 'http://localhost:4000', ...analysis }),
      })
      if (!res.ok) throw new Error(await res.text())

      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const data = await res.json()
        setGeneratedOutput(data)
        if (data.collection) setOutput(JSON.stringify(data.collection, null, 2))
        else if (data.script) setOutput(data.script)
        else if (data.jmx) setOutput(data.jmx)
        else setOutput(JSON.stringify(data, null, 2))
      } else {
        const text = await res.text()
        try { const parsed = JSON.parse(text); setOutput(JSON.stringify(parsed, null, 2)); setGeneratedOutput(parsed) }
        catch (_) { setOutput(text); setGeneratedOutput({ type: 'text', content: text }) }
      }

      setStatus(`${kind} generation complete`)
    } catch (err) {
      console.error(err)
      setStatus(`${kind} generation failed: ` + err.message)
      setOutput('')
      setGeneratedOutput(null)
    } finally {
      setLoading(false)
    }
  }

  async function runEnrollmentFlow() {
    setLoading(true)
    setStatus('running enrollment flow...')
    try {
      const res = await fetch(`${API_BASE}/run-enrollment-flow`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      const text = await res.text()
      let parsed = null
      try { parsed = JSON.parse(text) } catch (_) { parsed = null }

      if (!res.ok) {
        if (parsed) { setGeneratedOutput({ type: 'run', content: parsed }); setOutput(JSON.stringify(parsed, null, 2)) }
        else { setOutput(text || 'Enrollment flow failed') }
        setStatus('enrollment flow execution failed')
        return
      }

      const data = parsed || {}
      setGeneratedOutput({ type: 'run', content: data })
      setOutput(JSON.stringify(data, null, 2))
      setStatus('enrollment flow execution complete')
    } catch (err) {
      console.error(err)
      setStatus('enrollment flow execution failed: ' + err.message)
      setOutput('')
      setGeneratedOutput(null)
    } finally {
      setLoading(false)
    }
  }

  function copyGeneratedOutput() {
    if (!generatedOutput) return setStatus('Nothing to copy')
    try {
      if (generatedOutput.type === 'postman') {
        navigator.clipboard.writeText(JSON.stringify(generatedOutput.collection, null, 2))
        setStatus('Postman collection copied to clipboard')
      } else if (generatedOutput.type === 'playwright') {
        navigator.clipboard.writeText(generatedOutput.script)
        setStatus('Playwright script copied to clipboard')
      } else if (generatedOutput.type === 'jmeter') {
        navigator.clipboard.writeText(generatedOutput.jmx)
        setStatus('JMeter JMX copied to clipboard')
      } else if (generatedOutput.type === 'run') {
        navigator.clipboard.writeText(JSON.stringify(generatedOutput.content, null, 2))
        setStatus('Run result copied to clipboard')
      } else if (generatedOutput.content && typeof generatedOutput.content === 'string') {
        navigator.clipboard.writeText(generatedOutput.content)
        setStatus('Output copied to clipboard')
      }
    } catch (err) {
      console.error(err)
      setStatus('Copy failed: ' + err.message)
    }
  }

  function downloadTextFile(fileName, content, mimeType = 'text/plain') {
    try {
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
      setStatus(`${fileName} downloaded`)
    } catch (err) {
      console.error(err)
      setStatus('Download failed: ' + err.message)
    }
  }

  const detected = analysis?.detectedSteps || []
  const variables = analysis?.dynamicVariables || []
  const productivityMsg = generatedOutput?.type === 'postman' ? 'Generated reusable Postman collection + environment in under 1 minute. Manual setup usually takes 45–60 minutes.' : generatedOutput?.type === 'playwright' ? 'Generated Playwright API test in under 1 minute. Manual coding and debugging usually takes 60–90 minutes.' : generatedOutput?.type === 'jmeter' ? 'Generated JMeter JMX test plan in under 1 minute. Manual setup with samplers, extractors, headers, and assertions usually takes 2–3 hours.' : generatedOutput?.productivityMessage || 'Generated reusable Postman collection + environment in under 1 minute. Manually creating this 5-step API collection usually takes 45–60 minutes.'

  const displayFileName = generatedOutput?.fileName || (generatedOutput?.type === 'playwright' ? 'enrollment-flow.spec.ts' : (generatedOutput?.type === 'jmeter' ? 'enrollment-flow.jmx' : 'postman_collection.json'))

  return (
    <div className="flex h-screen overflow-hidden text-on-surface">
      {/* SideNavBar */}
      <aside className="flex flex-col h-full p-6 gap-4 bg-white border-r w-64 flex-shrink-0 z-20">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-8 h-8 bg-[#003d9b] rounded-lg flex items-center justify-center text-white">🏷</div>
          <div>
            <h2 className="text-lg font-bold">Discovery</h2>
            <p className="text-sm text-gray-500">Automation Hub</p>
          </div>
        </div>
        <nav className="flex-grow flex flex-col gap-2 px-2">
          <a onClick={(e)=>{e.preventDefault(); showNavDemoToast()}} className="px-3 py-2 rounded-lg hover:bg-gray-50">Home</a>
          <a onClick={(e)=>{e.preventDefault(); showNavDemoToast()}} className="px-3 py-2 rounded-lg hover:bg-gray-50">Automation Flows</a>
          <a onClick={(e)=>{e.preventDefault(); showNavDemoToast()}} className="px-3 py-2 rounded-lg bg-purple-100 text-purple-700 font-bold">API Discovery</a>
          <a onClick={(e)=>{e.preventDefault(); showNavDemoToast()}} className="px-3 py-2 rounded-lg hover:bg-gray-50">Environment</a>
          <a onClick={(e)=>{e.preventDefault(); showNavDemoToast()}} className="px-3 py-2 rounded-lg hover:bg-gray-50">Settings</a>
        </nav>
        <div className="mt-auto px-2">
          <div className="border-t pt-2">
            <a className="block py-2">Support</a>
            <a className="block py-2">Dark Mode</a>
          </div>
        </div>
      </aside>

      <div className="flex-grow flex flex-col min-w-0">
        {/* TopNavBar */}
        <header className="flex justify-between items-center px-6 py-3 bg-white border-b sticky top-0 z-10">
          <div className="flex items-center gap-6">
            <span className="text-xl font-bold text-[#003d9b]">TestFlow Agent</span>
            <div className="hidden md:flex items-center gap-4 ml-6">
              <a className="text-gray-600">Dashboard</a>
              <a className="text-gray-600">Projects</a>
              <a className="text-[#003d9b] font-bold border-b-2 border-[#003d9b] pb-1">Discovery</a>
              <a className="text-gray-600">Documentation</a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden lg:block relative">
            <input onFocus={()=>showNavDemoToast()} className="bg-gray-50 border rounded-full py-2 pl-10 pr-4 w-64" placeholder="Search resources..." />
              <span className="absolute left-3 top-2 text-gray-400">🔍</span>
            </div>
            <button className="p-2">🔔</button>
            <button className="p-2">❓</button>
            <button className="p-2">⚙️</button>
            <div className="w-8 h-8 rounded-full bg-gray-200 ml-2" />
          </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-grow overflow-auto p-6 bg-[#F4F5F7]">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold">Discovery Dashboard</h1>
                <p className="text-gray-600">Translate manual test cases into automated API orchestration flows.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>showNavDemoToast()} className="px-4 py-2 bg-white border rounded">History</button>
                <button onClick={()=>showNavDemoToast()} className="px-4 py-2 bg-[#003d9b] text-white rounded">+ New Discovery</button>
              </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-6">
              {/* Column 1 */}
              <section className="lg:col-span-3 flex flex-col gap-6">
                <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-[#003d9b]">📄</span>
                    <h3 className="text-lg font-bold">Automation Discovery</h3>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">Enter your manual steps in plain English. The agent will parse API endpoints.</p>
                  <div className="bg-gray-50 border rounded-lg p-4 mb-4">
                    <label className="block text-sm text-gray-500 mb-2">Manual enrollment test case</label>
                    <textarea className="w-full h-40 bg-transparent border-none focus:ring-0 text-sm" value={input} onChange={(e)=>setInput(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={analyzeFlow} disabled={!input.trim()} className={`w-full py-3 rounded ${input.trim() ? 'bg-[#003d9b] text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>Analyze Flow</button>
                    <button onClick={()=>generate('postman')} disabled={!analysis} className={`w-full py-3 rounded ${analysis ? 'bg-gray-100' : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}>Generate Postman</button>
                    <div className="mt-3 pt-3 border-t flex gap-2">
                      <button onClick={()=>generate('playwright')} disabled={!analysis} className={`flex-1 py-2 rounded ${analysis ? 'bg-white border' : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}>Playwright</button>
                      <button onClick={()=>generate('jmeter')} disabled={!analysis} className={`flex-1 py-2 rounded ${analysis ? 'bg-white border' : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}>JMeter</button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Column 2 */}
              <section className="lg:col-span-4 flex flex-col gap-6">
                <div className="bg-white border rounded-xl p-6 shadow-sm h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3"><span>🔗</span><h3 className="text-lg font-bold">Detected API Flow</h3></div>
                    <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full">{detected.length} Steps</span>
                  </div>

                  <div className="space-y-3">
                    {detected.length > 0 ? (
                      detected.map(s => (
                        <div key={s.step} className="p-4 bg-gray-50 border rounded-lg hover:shadow">
                          <div className="flex items-start gap-4">
                            <div className="text-xl font-bold text-gray-400">{s.step}.</div>
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div className={`px-2 py-1 rounded text-white font-bold text-xs`} style={{background: s.method === 'GET' ? '#36B37E' : '#0052cc'}}>{s.method}</div>
                                <code className="text-blue-800 font-mono font-bold">{s.endpoint}</code>
                              </div>
                              <p className="text-sm"><strong>Action:</strong> {s.action}</p>
                              <p className="text-sm text-gray-500"><strong>Purpose:</strong> {s.purpose}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-sm text-gray-500">No detected APIs yet. Enter a manual test case and click Analyze Flow.</div>
                    )}

                    <div className="pt-4 border-t">
                      <h4 className="font-bold mb-2">Dynamic Variables</h4>
                      <div className="flex flex-wrap gap-2">
                        {(variables.length ? variables : []).map(v => (
                          <span key={v} className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">{v}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Column 3 */}
              <section className="lg:col-span-5 flex flex-col gap-6">
                <div className="bg-white border rounded-xl p-6 shadow-sm h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3"><span>💻</span><h3 className="text-lg font-bold">Generated Workspace</h3></div>
                    <div className="flex gap-2"><button onClick={()=>showNavDemoToast()} className="p-2">⟳</button><button onClick={()=>showNavDemoToast()} className="p-2">⤢</button></div>
                  </div>

                  <div className="bg-[#E9EDFF] text-[#0B1666] p-4 rounded mb-4 flex items-start gap-3">
                    <div>ℹ️</div>
                    <div>{productivityMsg || 'Generated reusable Postman collection + environment in under 1 minute. Manually creating this 5-step API collection usually takes 45–60 minutes.'}</div>
                  </div>

                  <div className="flex gap-3 mb-4">
                    {generatedOutput?.type === 'postman' && (
                      <>
                        <button onClick={copyGeneratedOutput} className="px-4 py-2 bg-white border rounded flex items-center gap-2">📋 Copy to clipboard</button>
                        <button onClick={()=>{ if (generatedOutput?.collection) downloadTextFile(generatedOutput.fileName || 'testflow-enrollment-collection.json', JSON.stringify(generatedOutput.collection, null, 2), 'application/json') }} className="px-4 py-2 bg-white border rounded flex items-center gap-2">⬇️ Postman Collection</button>
                        <button onClick={()=>{ if (generatedOutput?.environment) downloadTextFile(generatedOutput.environmentFileName || 'testflow-enrollment-environment.json', JSON.stringify(generatedOutput.environment, null, 2), 'application/json') }} className="px-4 py-2 bg-white border rounded flex items-center gap-2">⚙️ Environment</button>
                      </>
                    )}

                    {generatedOutput?.type === 'playwright' && (
                      <>
                        <button onClick={copyGeneratedOutput} className="px-4 py-2 bg-white border rounded flex items-center gap-2">📋 Copy to clipboard</button>
                        <button onClick={()=>{ downloadTextFile('enrollment-flow.spec.ts', generatedOutput.script || '', 'application/typescript') }} className="px-4 py-2 bg-white border rounded flex items-center gap-2">⬇️ Download Playwright .ts</button>
                      </>
                    )}

                    {generatedOutput?.type === 'jmeter' && (
                      <>
                        <button onClick={copyGeneratedOutput} className="px-4 py-2 bg-white border rounded flex items-center gap-2">📋 Copy to clipboard</button>
                        <button onClick={()=>{ downloadTextFile('enrollment-flow.jmx', generatedOutput.jmx || '', 'application/xml') }} className="px-4 py-2 bg-white border rounded flex items-center gap-2">⬇️ Download JMeter .jmx</button>
                      </>
                    )}

                    {generatedOutput?.type === 'run' && (
                      <button onClick={copyGeneratedOutput} className="px-4 py-2 bg-white border rounded flex items-center gap-2">📋 Copy Result</button>
                    )}

                    {!generatedOutput && (
                      <div className="text-sm text-gray-500">No generated output yet</div>
                    )}

                  </div>

                  <div className="flex-grow bg-[#091E42] rounded overflow-hidden flex flex-col">
                    <div className="bg-[#172B4D] px-4 py-2 flex items-center justify-between border-b border-[#253858]">
                      <span className="text-white opacity-70 font-mono">{displayFileName}</span>
                      <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                        <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                        <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
                      </div>
                    </div>
                    <div className="p-4 overflow-auto text-sm font-mono text-[#E6E6E6]">
                      <pre>{output || JSON.stringify(generatedOutput?.collection || {}, null, 2) || 'Generated output will appear here'}</pre>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Toast */}
            {showToast && (
              <div className="fixed bottom-6 right-6 bg-white border p-4 rounded shadow flex items-center gap-3">
                <div className="text-green-500">✅</div>
                <div>Flow analyzed successfully. { (analysis?.detectedSteps || []).length || 5 } API endpoints detected.</div>
              </div>
            )}

            {navToast && (
              <div className="fixed bottom-6 left-6 bg-white border p-3 rounded shadow text-sm">
                {navToastMessage}
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  )
}

export default App
