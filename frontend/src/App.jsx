import { useEffect, useRef, useState } from 'react'
import './App.css'
import jmeterLogo from './assets/jmeter.png'
import postmanLogo from './assets/Postman.svg'
import playwrightLogo from './assets/Playwright.svg'

const IconPostman = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block">
    <rect x="2" y="2" width="20" height="20" rx="4" fill="#FF6C37" />
    <path d="M9 8h3a2 2 0 0 1 0 4H9v4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IconPlaywright = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block">
    <path d="M3 12L12 3L21 12L12 21L3 12Z" fill="#6F42C1" />
  </svg>
)

const IconJMeter = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block">
    <circle cx="12" cy="12" r="9" fill="#23A455" />
    <path d="M9 8v8a3 3 0 0 0 6 0v-2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const AGENT_API_BASE = 'http://localhost:5001/agent'
const DISCOVERY_API_BASE = 'http://localhost:5001/discovery'
const DEFAULT_DISCOVERY_BASE_URL = 'http://localhost:4000'

function App() {
  const [input, setInput] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [output, setOutput] = useState('')
  const [generatedOutput, setGeneratedOutput] = useState(null)
  const [loadingAction, setLoadingAction] = useState(null)
  const [status, setStatus] = useState('')
  const [statusVariant, setStatusVariant] = useState('info')
  const [showToast, setShowToast] = useState(false)
  const [navToast, setNavToast] = useState(false)
  const [navToastMessage, setNavToastMessage] = useState('')
  const [discoveryBaseUrl, setDiscoveryBaseUrl] = useState(DEFAULT_DISCOVERY_BASE_URL)
  const [discoverySession, setDiscoverySession] = useState(null)
  const [stepOverrides, setStepOverrides] = useState({})
  const [showExcludedApis, setShowExcludedApis] = useState(false)
  const detectedRef = useRef(null)
  const generatedRef = useRef(null)

  const detected = analysis?.detectedSteps || []
  const variables = analysis?.dynamicVariables || []
  const capturedApis = discoverySession?.capturedApis || []
  const includedCapturedApis = discoverySession?.includedApis || []
  const excludedCapturedApis = capturedApis.filter((api) => api.included === false)
  const excludedSummary = excludedCapturedApis.reduce((summary, api) => {
    const reason = api.excludeReason || 'unknown'
    summary[reason] = (summary[reason] || 0) + 1
    return summary
  }, {})
  const capturedVariables = discoverySession?.dynamicVariables || []
  const hasCapturedFlow = Boolean(discoverySession?.capturedApiCount)
  const isDiscoveryRunning = Boolean(discoverySession?.active)
  const canGenerate = Boolean(analysis || hasCapturedFlow)
  const activeBaseUrl = discoverySession?.baseUrl || discoveryBaseUrl || DEFAULT_DISCOVERY_BASE_URL
  const productivityMsg = generatedOutput?.type === 'postman'
    ? 'Generated reusable Postman collection + environment in under 1 minute. Manual setup usually takes 45–60 minutes.'
    : generatedOutput?.type === 'playwright'
      ? 'Generated Playwright API test in under 1 minute. Manual coding and debugging usually takes 60–90 minutes.'
      : generatedOutput?.type === 'jmeter'
        ? 'Generated JMeter JMX test plan in under 1 minute. Manual setup with samplers, extractors, headers, and assertions usually takes 2–3 hours.'
        : generatedOutput?.type === 'capturedFlow'
          ? 'Discovery completed. Generated assets will use the captured API flow.'
          : generatedOutput?.productivityMessage || 'Generated reusable Postman collection + environment in under 1 minute. Manually creating this 5-step API collection usually takes 45–60 minutes.'
  const displayFileName = generatedOutput?.fileName
    || (generatedOutput?.type === 'playwright'
      ? 'enrollment-flow.spec.ts'
      : generatedOutput?.type === 'jmeter'
        ? 'enrollment-flow.jmx'
        : generatedOutput?.type === 'capturedFlow'
          ? 'discovered-flow.json'
          : 'postman_collection.json')

  function showNavDemoToast(msg = 'Demo navigation only') {
    setNavToastMessage(msg)
    setNavToast(true)
    setTimeout(() => setNavToast(false), 3000)
  }

  function showSuccessToast() {
    setShowToast(true)
    setTimeout(() => setShowToast(false), 4000)
  }

  function normalizeAnalysisFromDiscovery(session) {
    if (!session) return null
    return {
      businessFlowName: 'Captured API Flow',
      detectedSteps: session.detectedSteps || [],
      dynamicVariables: (session.dynamicVariables || []).map((variable) => variable.name),
      source: 'captured'
    }
  }

  async function readJsonResponse(response) {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      return response.json()
    }

    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      return { error: text || 'Request failed' }
    }
  }

  function scrollToDetected() {
    try {
      if (detectedRef.current) {
        requestAnimationFrame(() => detectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      }
    } catch (error) {
      console.warn('scroll failed', error)
    }
  }

  function scrollToGenerated() {
    try {
      if (generatedRef.current) {
        requestAnimationFrame(() => generatedRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      }
    } catch (error) {
      console.warn('scroll failed', error)
    }
  }

  useEffect(() => {
    async function loadDiscoverySession() {
      try {
        const response = await fetch(`${DISCOVERY_API_BASE}/session`)
        if (!response.ok) {
          return
        }

        const data = await response.json()
        setDiscoverySession(data)
        if (data.baseUrl) {
          setDiscoveryBaseUrl(data.baseUrl)
        }
        if (data.capturedApiCount) {
          setAnalysis(normalizeAnalysisFromDiscovery(data))
        }
      } catch (error) {
        console.warn('Unable to load discovery session', error)
      }
    }

    loadDiscoverySession()
  }, [])

  async function analyzeFlow() {
    setLoadingAction('analyze')
    setStatus('Analyzing flow...')
    setStatusVariant('info')
    try {
      const response = await fetch(`${AGENT_API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualTestCase: input })
      })
      if (!response.ok) {
        const data = await readJsonResponse(response)
        throw new Error(data.message || data.error || 'Analyze request failed')
      }

      const data = await response.json()
      setAnalysis({ ...data, source: 'manual' })
      setOutput('')
      setStatus('Analysis complete')
      setStatusVariant('success')
      showSuccessToast()
      scrollToDetected()
    } catch (error) {
      console.error(error)
      setStatus(`Analysis failed: ${error.message}`)
      setStatusVariant('error')
      setAnalysis(null)
    } finally {
      setLoadingAction(null)
    }
  }

  async function startDiscovery() {
    setLoadingAction('discovery-start')
    setStatus('Starting live discovery...')
    setStatusVariant('info')
    try {
      const response = await fetch(`${DISCOVERY_API_BASE}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: discoveryBaseUrl,
          manualTestCase: input
        })
      })

      const data = await readJsonResponse(response)
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to start discovery')
      }

      setDiscoverySession(data)
      setAnalysis(null)
      setGeneratedOutput(null)
      setOutput('')
      setStepOverrides({})
      setStatus(data.message || 'Discovery started')
      setStatusVariant('info')
    } catch (error) {
      console.error(error)
      setStatus(`Discovery start failed: ${error.message}`)
      setStatusVariant('error')
    } finally {
      setLoadingAction(null)
    }
  }

  async function stopDiscovery() {
    setLoadingAction('discovery-stop')
    setStatus('Stopping live discovery...')
    setStatusVariant('info')
    try {
      const response = await fetch(`${DISCOVERY_API_BASE}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await readJsonResponse(response)
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to stop discovery')
      }

      setDiscoverySession(data)
      setAnalysis(normalizeAnalysisFromDiscovery(data))
      setGeneratedOutput({
        type: 'capturedFlow',
        fileName: 'discovered-flow.json',
        content: data,
        productivityMessage: 'Discovery completed. Generated assets will use captured API flow.'
      })
      setOutput(JSON.stringify(data, null, 2))
      setStatus(data.message || 'Discovery completed')
      setStatusVariant('success')
      showSuccessToast()
      scrollToDetected()
      scrollToGenerated()
    } catch (error) {
      console.error(error)
      setStatus(`Discovery stop failed: ${error.message}`)
      setStatusVariant('error')
    } finally {
      setLoadingAction(null)
    }
  }

  async function downloadHar() {
    try {
      const response = await fetch(`${DISCOVERY_API_BASE}/har/download`)
      if (!response.ok) {
        const data = await readJsonResponse(response)
        throw new Error(data.message || data.error || 'No HAR available')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = discoverySession?.harFileName || 'discovery-session.har'
      anchor.click()
      URL.revokeObjectURL(url)
      setStatus('HAR downloaded')
      setStatusVariant('success')
    } catch (error) {
      console.error(error)
      setStatus(`HAR download failed: ${error.message}`)
      setStatusVariant('error')
    }
  }

  async function clearDiscovery() {
    setLoadingAction('discovery-clear')
    try {
      const response = await fetch(`${DISCOVERY_API_BASE}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await readJsonResponse(response)
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to clear discovery')
      }

      setDiscoverySession(data)
      setGeneratedOutput(null)
      setOutput('')
      setStepOverrides({})
      if (analysis?.source === 'captured') {
        setAnalysis(null)
      }
      setStatus('Discovery cleared')
      setStatusVariant('success')
    } catch (error) {
      console.error(error)
      setStatus(`Clear discovery failed: ${error.message}`)
      setStatusVariant('error')
    } finally {
      setLoadingAction(null)
    }
  }

  async function updateStepOutcome(stepNumber, expectedOutcome) {
    setStepOverrides((prev) => ({ ...prev, [stepNumber]: expectedOutcome }))
    try {
      const response = await fetch(`${DISCOVERY_API_BASE}/session/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: [{ stepNumber, expectedOutcome }] })
      })
      const data = await readJsonResponse(response)
      if (response.ok) {
        setDiscoverySession(data)
      }
    } catch (error) {
      console.warn('Failed to apply step override', error)
    }
  }

  async function generate(kind) {
    if (!canGenerate) {
      setStatus('Analyze the flow or complete a live discovery first')
      setStatusVariant('error')
      return
    }

    setLoadingAction(`generate-${kind}`)
    setStatus(`Generating ${kind}...`)
    setStatusVariant('info')
    try {
      let endpoint = `${AGENT_API_BASE}/generate/${kind}`
      if (kind === 'postman') endpoint = `${AGENT_API_BASE}/generate-postman`
      if (kind === 'playwright') endpoint = `${AGENT_API_BASE}/generate-playwright`
      if (kind === 'jmeter') endpoint = `${AGENT_API_BASE}/generate-jmeter`

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: activeBaseUrl, manualTestCase: input, ...analysis })
      })

      const data = await readJsonResponse(response)
      if (!response.ok) {
        throw new Error(data.message || data.error || `${kind} generation failed`)
      }

      setGeneratedOutput(data)
      if (data.collection) {
        setOutput(JSON.stringify(data.collection, null, 2))
      } else if (data.script) {
        setOutput(data.script)
      } else if (data.jmx) {
        setOutput(data.jmx)
      } else {
        setOutput(JSON.stringify(data, null, 2))
      }

      setStatus(`${kind} generation complete`)
      setStatusVariant('success')
      scrollToGenerated()
    } catch (error) {
      console.error(error)
      setStatus(`${kind} generation failed: ${error.message}`)
      setStatusVariant('error')
      setOutput('')
      setGeneratedOutput(null)
    } finally {
      setLoadingAction(null)
    }
  }

  async function runEnrollmentFlow() {
    setLoadingAction('run')
    setStatus('Running enrollment flow...')
    setStatusVariant('info')
    try {
      const response = await fetch(`${AGENT_API_BASE}/run-enrollment-flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualTestCase: input })
      })

      const data = await readJsonResponse(response)
      if (!response.ok) {
        setGeneratedOutput({ type: 'run', content: data })
        setOutput(JSON.stringify(data, null, 2))
        setStatus('Enrollment flow execution failed')
        setStatusVariant('error')
        return
      }

      setGeneratedOutput({ type: 'run', content: data })
      setOutput(JSON.stringify(data, null, 2))
      setStatus('Enrollment flow execution complete')
      setStatusVariant('success')
      scrollToGenerated()
    } catch (error) {
      console.error(error)
      setStatus(`Enrollment flow execution failed: ${error.message}`)
      setStatusVariant('error')
      setOutput('')
      setGeneratedOutput(null)
    } finally {
      setLoadingAction(null)
    }
  }

  function copyGeneratedOutput() {
    if (!generatedOutput) {
      setStatus('Nothing to copy')
      return
    }

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
      } else if (generatedOutput.type === 'capturedFlow' || generatedOutput.type === 'run') {
        navigator.clipboard.writeText(JSON.stringify(generatedOutput.content, null, 2))
        setStatus('JSON output copied to clipboard')
      } else if (generatedOutput.content && typeof generatedOutput.content === 'string') {
        navigator.clipboard.writeText(generatedOutput.content)
        setStatus('Output copied to clipboard')
      }
    } catch (error) {
      console.error(error)
      setStatus(`Copy failed: ${error.message}`)
    }
  }

  function downloadTextFile(fileName, content, mimeType = 'text/plain') {
    try {
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(url)
      setStatus(`${fileName} downloaded`)
    } catch (error) {
      console.error(error)
      setStatus(`Download failed: ${error.message}`)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden text-on-surface">
      <aside className="flex flex-col h-full p-6 gap-4 bg-white border-r w-64 flex-shrink-0 z-20">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-8 h-8 bg-[#003d9b] rounded-lg flex items-center justify-center text-white">🏷</div>
          <div>
            <h2 className="text-lg font-bold">Discovery</h2>
            <p className="text-sm text-gray-500">Automation Hub</p>
          </div>
        </div>
        <nav className="flex-grow flex flex-col gap-2 px-2">
          <a onClick={(event) => { event.preventDefault(); showNavDemoToast() }} className="px-3 py-2 rounded-lg hover:bg-gray-50">Home</a>
          <a onClick={(event) => { event.preventDefault(); showNavDemoToast() }} className="px-3 py-2 rounded-lg hover:bg-gray-50">Automation Flows</a>
          <a onClick={(event) => { event.preventDefault(); showNavDemoToast() }} className="px-3 py-2 rounded-lg bg-purple-100 text-purple-700 font-bold">API Discovery</a>
          <a onClick={(event) => { event.preventDefault(); showNavDemoToast() }} className="px-3 py-2 rounded-lg hover:bg-gray-50">Environment</a>
          <a onClick={(event) => { event.preventDefault(); showNavDemoToast() }} className="px-3 py-2 rounded-lg hover:bg-gray-50">Settings</a>
        </nav>
        <div className="mt-auto px-2">
          <div className="border-t pt-2">
            <a className="block py-2">Support</a>
            <a className="block py-2">Dark Mode</a>
          </div>
        </div>
      </aside>

      <div className="flex-grow flex flex-col min-w-0">
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
              <input onFocus={() => showNavDemoToast()} className="bg-gray-50 border rounded-full py-2 pl-10 pr-4 w-64" placeholder="Search resources..." />
              <span className="absolute left-3 top-2 text-gray-400">🔍</span>
            </div>
            <button className="p-2">🔔</button>
            <button className="p-2">❓</button>
            <button className="p-2">⚙️</button>
            <div className="w-8 h-8 rounded-full bg-gray-200 ml-2" />
          </div>
        </header>

        <main className="flex-grow overflow-auto p-6 bg-[#F4F5F7]">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold">Discovery Dashboard</h1>
                <p className="text-gray-600">Translate manual test cases into automated API orchestration flows.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => showNavDemoToast()} className="px-4 py-2 bg-white border rounded">History</button>
                <button onClick={() => showNavDemoToast()} className="px-4 py-2 bg-[#003d9b] text-white rounded">+ New Discovery</button>
              </div>
            </div>

            <div className="top-row">
              <section className="left lg:col-span-3 flex flex-col gap-6">
                <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col panel">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-[#003d9b]">📄</span>
                    <h3 className="text-lg font-bold">Automation Discovery</h3>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">Enter your manual steps in plain English. The agent will parse API endpoints.</p>

                  <div className="bg-gray-50 border rounded-lg p-4 mb-4">
                    <label className="block text-sm text-gray-500 mb-2">Manual enrollment test case</label>
                    <textarea className="w-full bg-transparent border-none focus:ring-0 text-sm input-area" value={input} onChange={(event) => setInput(event.target.value)} />
                  </div>

                  <div className="bg-gray-50 border rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span>🧭</span>
                      <h4 className="font-bold">Live API Discovery</h4>
                    </div>
                    <label className="block text-sm text-gray-500 mb-2">Base URL</label>
                    <input
                      className="w-full bg-white border rounded px-3 py-2 text-sm mb-3"
                      placeholder="https://your-app-url.com"
                      value={discoveryBaseUrl}
                      onChange={(event) => setDiscoveryBaseUrl(event.target.value)}
                      disabled={isDiscoveryRunning}
                    />
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={startDiscovery}
                        disabled={!discoveryBaseUrl.trim() || loadingAction === 'discovery-start' || isDiscoveryRunning}
                        className={`flex-1 py-2 rounded ${!discoveryBaseUrl.trim() || loadingAction === 'discovery-start' || isDiscoveryRunning ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#003d9b] text-white'}`}
                      >
                        {loadingAction === 'discovery-start' ? 'Starting…' : 'Start Discovery'}
                      </button>
                      <button
                        onClick={stopDiscovery}
                        disabled={loadingAction === 'discovery-stop' || !isDiscoveryRunning}
                        className={`flex-1 py-2 rounded ${loadingAction === 'discovery-stop' || !isDiscoveryRunning ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border'}`}
                      >
                        {loadingAction === 'discovery-stop' ? 'Stopping…' : 'Stop Discovery'}
                      </button>
                    </div>
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={downloadHar}
                        disabled={!discoverySession?.harFileName || isDiscoveryRunning}
                        className={`flex-1 py-2 rounded ${discoverySession?.harFileName && !isDiscoveryRunning ? 'bg-white border' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                      >
                        Download HAR
                      </button>
                      <button
                        onClick={clearDiscovery}
                        disabled={loadingAction === 'discovery-clear'}
                        className={`flex-1 py-2 rounded ${loadingAction === 'discovery-clear' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border'}`}
                      >
                        {loadingAction === 'discovery-clear' ? 'Clearing…' : 'Clear Discovery'}
                      </button>
                    </div>
                    <div className="text-sm text-gray-600">
                      <strong>Status:</strong> {discoverySession?.message || 'Not started'}
                    </div>

                    {hasCapturedFlow && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        {analysis?.source === 'captured' && (
                          <div className="text-sm font-medium text-green-700">Generated assets will now use the captured API flow.</div>
                        )}
                        <div className="text-sm text-gray-600"><strong>Captured APIs:</strong> {discoverySession.capturedApiCount}</div>
                        <div className="space-y-2 max-h-56 overflow-auto">
                          {includedCapturedApis.map((api) => (
                            <div key={api.id} className="bg-white border rounded p-3 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`px-2 py-1 rounded text-white text-xs font-bold ${api.method === 'GET' ? 'method-get' : 'method'}`}>{api.method}</span>
                                  <code className="truncate text-blue-800 font-mono">{`${api.path || ''}${api.queryString || ''}`}</code>
                                </div>
                                <span className="text-xs text-gray-500">{api.responseStatus}</span>
                              </div>
                              <div className="mt-2 text-xs text-gray-500">
                                {api.operationName} · Payload: {api.requestBody ? 'Yes' : 'No'} · Duration: {api.durationMs} ms{api.repeatCount > 1 ? ` · seen ${api.repeatCount}×` : ''}
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <label className="text-xs text-gray-500">Assertion:</label>
                                <select
                                  value={stepOverrides[api.stepNumber] || api.expectedOutcome || 'as-captured'}
                                  onChange={(event) => updateStepOutcome(api.stepNumber, event.target.value)}
                                  className="text-xs border rounded px-1 py-0.5 bg-white"
                                >
                                  <option value="as-captured">As captured ({api.responseStatus})</option>
                                  <option value="success">Expect success</option>
                                  <option value="failure">Expect failure</option>
                                </select>
                              </div>
                            </div>
                          ))}
                        </div>
                        {excludedCapturedApis.length > 0 && (
                          <div className="text-xs">
                            <button onClick={() => setShowExcludedApis((prev) => !prev)} className="text-gray-500 underline">
                              {showExcludedApis ? 'Hide' : 'Show'} {excludedCapturedApis.length} excluded ({Object.entries(excludedSummary).map(([reason, count]) => `${reason}: ${count}`).join(', ')})
                            </button>
                            {showExcludedApis && (
                              <div className="mt-2 space-y-1 max-h-40 overflow-auto">
                                {excludedCapturedApis.map((api) => (
                                  <div key={api.id} className="text-gray-400 truncate">
                                    {api.method} {api.path}{api.queryString} — {api.excludeReason}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div>
                          <h5 className="font-bold mb-2">Dynamic Variables Detected</h5>
                          <div className="flex flex-wrap gap-2">
                            {capturedVariables.map((variable) => (
                              <span key={`${variable.name}-${variable.sourceStep}`} className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">
                                {variable.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className={`text-xs font-medium px-3 py-2 rounded ${
                      analysis?.source === 'captured'
                        ? 'bg-green-50 text-green-700'
                        : analysis?.source === 'manual'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-gray-50 text-gray-500'
                    }`}
                    >
                      {analysis?.source === 'captured'
                        ? `Will generate from: Captured Flow (${detected.length} steps)`
                        : analysis?.source === 'manual'
                          ? 'Will generate from: Manual Scenario'
                          : 'Analyze a flow or run discovery to enable Generate'}
                    </div>
                    <button
                      onClick={analyzeFlow}
                      disabled={!input.trim() || loadingAction === 'analyze'}
                      className={`w-full py-3 rounded ${input.trim() && loadingAction !== 'analyze' ? 'bg-[#003d9b] text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                    >
                      {loadingAction === 'analyze' ? 'Working...' : 'Analyze Flow'}
                    </button>
                    <button
                      onClick={() => generate('postman')}
                      disabled={!canGenerate || loadingAction === 'generate-postman'}
                      className={`w-full py-3 rounded ${canGenerate && loadingAction !== 'generate-postman' ? 'bg-gray-100' : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}
                    >
                      {loadingAction === 'generate-postman' ? 'Generating…' : 'Generate Postman'}
                    </button>
                    <div className="mt-3 pt-3 border-t flex gap-2">
                      <button
                        onClick={() => generate('playwright')}
                        disabled={!canGenerate || loadingAction === 'generate-playwright'}
                        className={`flex-1 py-2 rounded ${canGenerate && loadingAction !== 'generate-playwright' ? 'bg-white border' : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}
                      >
                        {loadingAction === 'generate-playwright' ? 'Generating…' : 'Playwright'}
                      </button>
                      <button
                        onClick={() => generate('jmeter')}
                        disabled={!canGenerate || loadingAction === 'generate-jmeter'}
                        className={`flex-1 py-2 rounded ${canGenerate && loadingAction !== 'generate-jmeter' ? 'bg-white border' : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}
                      >
                        {loadingAction === 'generate-jmeter' ? 'Generating…' : 'JMeter'}
                      </button>
                    </div>
                    <button
                      onClick={runEnrollmentFlow}
                      disabled={loadingAction === 'run'}
                      className={`mt-3 w-full py-3 rounded ${loadingAction === 'run' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border'}`}
                    >
                      {loadingAction === 'run' ? 'Running…' : 'Run Enrollment Flow'}
                    </button>
                  </div>
                </div>
              </section>

              <section ref={detectedRef} className="right lg:col-span-4 flex flex-col gap-6">
                <div className="bg-white border rounded-xl p-6 shadow-sm h-full flex flex-col panel">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3"><span>🔗</span><h3 className="text-lg font-bold">Detected API Flow</h3></div>
                    <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full">{detected.length} Steps</span>
                  </div>

                  <div className="space-y-3 steps-list">
                    {detected.length > 0 ? (
                      detected.map((step) => (
                        <div key={`${step.step}-${step.endpoint}`} className="p-4 bg-gray-50 border rounded-lg hover:shadow step-card">
                          <div className="flex items-start gap-4">
                            <div className="text-xl font-bold text-gray-400">{step.step}.</div>
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div className={`px-2 py-1 rounded text-white font-bold text-xs ${step.method === 'GET' ? 'method-get' : 'method'}`}>{step.method}</div>
                                <code className="text-blue-800 font-mono font-bold endpoint">{step.endpoint}</code>
                              </div>
                              <p className="text-sm"><strong>Action:</strong> {step.action}</p>
                              <p className="text-sm text-gray-500"><strong>Purpose:</strong> {step.purpose}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-sm text-gray-500">No detected APIs yet. Enter a manual test case and click Analyze Flow, or complete a live discovery session.</div>
                    )}

                    <div className="pt-4 border-t">
                      <h4 className="font-bold mb-2">Dynamic Variables</h4>
                      <div className="flex flex-wrap gap-2">
                        {(variables.length ? variables : []).map((variable) => (
                          <span key={typeof variable === 'string' ? variable : variable.name} className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">
                            {typeof variable === 'string' ? variable : variable.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="bottom-row">
              <section className="lg:col-span-5 flex flex-col gap-6">
                <div ref={generatedRef} className="bg-white border rounded-xl p-6 shadow-sm h-full flex flex-col panel">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3"><span>💻</span><h3 className="text-lg font-bold">Generated Workspace</h3></div>
                    <div className="flex gap-2"><button onClick={() => showNavDemoToast()} className="p-2">⟳</button><button onClick={() => showNavDemoToast()} className="p-2">⤢</button></div>
                  </div>

                  <div className="bg-[#E9EDFF] text-[#0B1666] p-4 rounded mb-4 flex items-start gap-3">
                    <div>ℹ️</div>
                    <div>{productivityMsg}</div>
                  </div>

                  <div className="flex gap-3 mb-4 flex-wrap">
                    {generatedOutput?.type === 'postman' && (
                      <>
                        <button onClick={copyGeneratedOutput} className="px-4 py-2 bg-white border rounded flex items-center gap-2"><IconPostman /><span className="ml-2">Copy</span></button>
                        <button onClick={() => { if (generatedOutput?.collection) downloadTextFile(generatedOutput.fileName || 'testflow-enrollment-collection.json', JSON.stringify(generatedOutput.collection, null, 2), 'application/json') }} className="px-4 py-2 bg-white border rounded flex items-center gap-2"><img src={postmanLogo} alt="Postman" className="w-5 h-5" /><span className="ml-2">Download Postman Collection</span></button>
                        <button onClick={() => { if (generatedOutput?.environment) downloadTextFile(generatedOutput.environmentFileName || 'testflow-enrollment-environment.json', JSON.stringify(generatedOutput.environment, null, 2), 'application/json') }} className="px-4 py-2 bg-white border rounded flex items-center gap-2"><img src={postmanLogo} alt="Postman" className="w-5 h-5" /><span className="ml-2">Download Environment</span></button>
                      </>
                    )}

                    {generatedOutput?.type === 'playwright' && (
                      <>
                        <button onClick={copyGeneratedOutput} className="px-4 py-2 bg-white border rounded flex items-center gap-2"><IconPlaywright /><span className="ml-2">Copy</span></button>
                        <button onClick={() => downloadTextFile(generatedOutput.fileName || 'enrollment-flow.spec.ts', generatedOutput.script || '', 'application/typescript')} className="px-4 py-2 bg-white border rounded flex items-center gap-2"><img src={playwrightLogo} alt="Playwright" className="w-5 h-5" /><span className="ml-2">Download Playwright .ts</span></button>
                      </>
                    )}

                    {generatedOutput?.type === 'jmeter' && (
                      <>
                        <button onClick={copyGeneratedOutput} className="px-4 py-2 bg-white border rounded flex items-center gap-2"><IconJMeter /><span className="ml-2">Copy</span></button>
                        <button onClick={() => downloadTextFile(generatedOutput.fileName || 'enrollment-flow.jmx', generatedOutput.jmx || '', 'application/xml')} className="px-4 py-2 bg-white border rounded flex items-center gap-2"><img src={jmeterLogo} alt="JMeter" className="w-5 h-5" /><span className="ml-2">Download JMeter .jmx</span></button>
                        {generatedOutput.testData && (
                          <button onClick={() => downloadTextFile(generatedOutput.dataFileName || 'discovered-flow-data.json', JSON.stringify(generatedOutput.testData, null, 2), 'application/json')} className="px-4 py-2 bg-white border rounded flex items-center gap-2">📄<span className="ml-2">Download Test Data JSON</span></button>
                        )}
                      </>
                    )}

                    {(generatedOutput?.type === 'capturedFlow' || generatedOutput?.type === 'run') && (
                      <>
                        <button onClick={copyGeneratedOutput} className="px-4 py-2 bg-white border rounded flex items-center gap-2">📋 Copy JSON</button>
                        <button onClick={() => downloadTextFile(displayFileName, JSON.stringify(generatedOutput.content, null, 2), 'application/json')} className="px-4 py-2 bg-white border rounded flex items-center gap-2">⬇️ Download JSON</button>
                      </>
                    )}

                    {!generatedOutput && (
                      <div className="text-sm text-gray-500">No generated output yet</div>
                    )}
                  </div>

                  <div className="flex-grow bg-[#091E42] rounded overflow-hidden flex flex-col">
                    <div className="code-header">
                      <span className="text-white opacity-70 font-mono">{displayFileName}</span>
                      <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                        <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                        <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
                      </div>
                    </div>
                    <div className="p-4 overflow-auto text-sm font-mono text-[#E6E6E6] output-block">
                      <pre>{output || JSON.stringify(generatedOutput?.collection || {}, null, 2) || 'Generated output will appear here'}</pre>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {showToast && (
              <div className="fixed bottom-6 right-6 bg-white border p-4 rounded shadow flex items-center gap-3">
                <div className="text-green-500">✅</div>
                <div>
                  {analysis?.source === 'captured'
                    ? `Discovery completed. ${discoverySession?.capturedApiCount || 0} API calls captured.`
                    : `Flow analyzed successfully. ${(analysis?.detectedSteps || []).length || 0} API endpoints detected.`}
                </div>
              </div>
            )}

            {navToast && (
              <div className="fixed bottom-6 left-6 bg-white border p-3 rounded shadow text-sm">
                {navToastMessage}
              </div>
            )}

            <div className={`mt-4 text-sm ${statusVariant === 'error' ? 'text-red-600 font-medium' : statusVariant === 'success' ? 'text-green-700' : 'text-gray-600'}`}>{status}</div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
