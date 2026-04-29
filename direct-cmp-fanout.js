import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Network, List, MonitorPlay, Send, Plus, Minus, Info, Settings2, GitMerge } from 'lucide-react';

const COLORS = ['bg-rose-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-fuchsia-500'];

const generateId = () => Math.random().toString(36).substr(2, 9);

export default function App() {
  // --- 狀態管理 ---
  
  const [exchangeType, setExchangeType] = useState('direct');
  
  const [messageCounter, setMessageCounter] = useState(0);
  const [currentRoutingKey, setCurrentRoutingKey] = useState('info');
  const [isAutoProduce, setIsAutoProduce] = useState(false);

  const [queues, setQueues] = useState([
    { id: 'Q1', name: 'Log Queue', bindingKey: 'info', messages: [] },
    { id: 'Q2', name: 'Alert Queue', bindingKey: 'error', messages: [] }
  ]);

  const [consumers, setConsumers] = useState([
    { id: 'C1', targetQueue: 'Q1', state: 'idle', currentMsg: null },
    { id: 'C2', targetQueue: 'Q2', state: 'idle', currentMsg: null }
  ]);

  const [logs, setLogs] = useState([]);
  const endOfLogsRef = useRef(null);

  // 利用 useRef 儲存最新狀態，供 setInterval 讀取，避免 React 狀態更新衝突
  const queuesRef = useRef(queues);
  const consumersRef = useRef(consumers);

  useEffect(() => {
    queuesRef.current = queues;
    consumersRef.current = consumers;
  }, [queues, consumers]);

  const addLog = useCallback((msg) => {
    setLogs(prev => [...prev, { id: generateId(), time: new Date().toLocaleTimeString(), text: msg }].slice(-50));
  }, []);

  useEffect(() => {
    endOfLogsRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // --- 核心邏輯：生產者 (Producer) & 交換機 (Exchange) ---
  const produceMessage = useCallback(() => {
    const newMessage = {
      id: generateId(),
      text: `Msg-${messageCounter}`,
      routingKey: currentRoutingKey,
      color: COLORS[messageCounter % COLORS.length]
    };

    let routedCount = 0;

    setQueues(prev => {
      return prev.map(q => {
        let shouldReceive = false;
        if (exchangeType === 'fanout') {
          shouldReceive = true;
        } else if (exchangeType === 'direct' && q.bindingKey === newMessage.routingKey) {
          shouldReceive = true;
        }

        if (shouldReceive) {
          routedCount++;
          return { ...q, messages: [...q.messages, newMessage] };
        }
        return q;
      });
    });

    if (routedCount > 0) {
      addLog(`[Exchange] 收到 ${newMessage.text} (RK: ${newMessage.routingKey})，已路由至 ${routedCount} 個 Queue`);
    } else {
      addLog(`[Exchange] ⚠️ 收到 ${newMessage.text} (RK: ${newMessage.routingKey})，無匹配 Queue，訊息丟棄`);
    }

    setMessageCounter(prev => prev + 1);
  }, [messageCounter, currentRoutingKey, exchangeType, addLog]);

  // 自動發送機制
  useEffect(() => {
    let interval;
    if (isAutoProduce) {
      interval = setInterval(produceMessage, 1500);
    }
    return () => clearInterval(interval);
  }, [isAutoProduce, produceMessage]);

  // --- 核心邏輯：消費者拉取訊息與 Ack 機制 ---
  useEffect(() => {
    const consumeInterval = setInterval(() => {
      const currentQueues = [...queuesRef.current.map(q => ({ ...q, messages: [...q.messages] }))];
      const currentConsumers = [...consumersRef.current];

      let hasQueueChanges = false;
      let hasConsumerChanges = false;

      currentQueues.forEach((q, qIndex) => {
        if (q.messages.length === 0) return;

        // 找尋當下監聽此 Queue 且狀態為 idle 的消費者
        const idleConsumers = currentConsumers.filter(c => c.targetQueue === q.id && c.state === 'idle');

        idleConsumers.forEach(consumer => {
          // 確保佇列中還有訊息可以拿
          if (currentQueues[qIndex].messages.length > 0) {
            const msgToProcess = currentQueues[qIndex].messages.shift();
            hasQueueChanges = true;

            // 更新為處理中
            const cIndex = currentConsumers.findIndex(c => c.id === consumer.id);
            currentConsumers[cIndex] = { ...consumer, state: 'processing', currentMsg: msgToProcess };
            hasConsumerChanges = true;

            addLog(`[${consumer.id}] 從 ${q.id} 拿取 ${msgToProcess.text} 開始處理`);

            // 模擬處理時間，處理完畢後發送 Ack，消費者回到 idle
            setTimeout(() => {
              setConsumers(prev => prev.map(c => 
                c.id === consumer.id ? { ...c, state: 'idle', currentMsg: null } : c
              ));
              addLog(`[${consumer.id}] ✅ 處理完畢 (Ack): ${msgToProcess.text} 已徹底銷毀`);
            }, 2500); // 模擬 2.5 秒的處理耗時
          }
        });
      });

      if (hasQueueChanges) setQueues(currentQueues);
      if (hasConsumerChanges) setConsumers(currentConsumers);

    }, 500);

    return () => clearInterval(consumeInterval);
  }, [addLog]);

  // --- 控制面板 Handlers ---
  const handleExchangeTypeChange = (type) => {
    setExchangeType(type);
    addLog(`[系統] 交換機模式已切換為：${type.toUpperCase()}`);
  };

  const addConsumer = (queueId) => {
    const queueConsumers = consumers.filter(c => c.targetQueue === queueId);
    if (queueConsumers.length < 3) { 
      const newId = `C${consumers.length + 1}`;
      setConsumers(prev => [...prev, { id: newId, targetQueue: queueId, state: 'idle', currentMsg: null }]);
      addLog(`[系統] 已增加消費者 ${newId} 監聽 ${queueId}`);
    }
  };

  const removeConsumer = (queueId) => {
    const queueConsumers = consumers.filter(c => c.targetQueue === queueId);
    if (queueConsumers.length > 0) {
      const targetId = queueConsumers[queueConsumers.length - 1].id;
      setConsumers(prev => prev.filter(c => c.id !== targetId));
      addLog(`[系統] 已移除消費者 ${targetId}`);
    }
  };

  const getInsight = () => {
    if (exchangeType === 'fanout') {
      return { type: 'info', text: "💡 Fanout (廣播) 模式：生產者發送的訊息會無視 Routing Key，直接複製並推播給所有綁定的 Queue。適合用於發布/訂閱系統的廣播訊息。" };
    }
    if (currentRoutingKey !== 'info' && currentRoutingKey !== 'error') {
       return { type: 'warning', text: "⚠️ 路由鍵未匹配：目前的 Routing Key 找不到任何對應的 Queue Binding Key。在 Direct 模式下，這筆訊息發送到 Exchange 後會直接被丟棄！" };
    }
    return { type: 'success', text: "✅ Direct (直連) 模式：Exchange 會精準比對訊息的 Routing Key 和 Queue 的 Binding Key。當消費者處理完畢發送 Ack 後，該訊息就會被永久刪除。" };
  };

  const insight = getInsight();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <header className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold flex items-center gap-3 text-slate-800">
            <Network className="text-orange-500" size={32} />
            RabbitMQ 核心機制視覺化模擬器
          </h1>
          <p className="text-slate-500 mt-2 text-lg">
            探索 Exchange 路由、Queue 儲存機制與 Consumer 的 Ack 確認流程。
          </p>
        </header>

        <div className={`p-4 rounded-xl border flex gap-4 items-start shadow-sm transition-colors duration-300 ${
          insight.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 
          insight.type === 'info' ? 'bg-blue-50 border-blue-200 text-blue-800' : 
          'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          <Info className="mt-0.5 shrink-0" size={24} />
          <p className="font-medium leading-relaxed text-sm md:text-base">
            {insight.text}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* 左側：生產者與設定 */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="font-bold text-lg mb-5 flex items-center gap-2 border-b pb-3 text-slate-700">
                <Send className="text-orange-500" size={20} /> 發布者 (Publisher)
              </h2>
              
              <div className="mb-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Routing Key (路由鍵)</label>
                <select 
                  value={currentRoutingKey}
                  onChange={(e) => setCurrentRoutingKey(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="info">info (匹配 Q1)</option>
                  <option value="error">error (匹配 Q2)</option>
                  <option value="unknown">unknown (不匹配)</option>
                </select>
              </div>

              <button 
                onClick={produceMessage}
                className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl transition-colors font-semibold mb-3 flex items-center justify-center gap-2 shadow-sm active:scale-95"
              >
                <Plus size={18} /> 發送單筆訊息
              </button>
              
              <button 
                onClick={() => setIsAutoProduce(!isAutoProduce)}
                className={`w-full py-2.5 ${isAutoProduce ? 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200 border' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200 border'} rounded-xl transition-colors font-semibold flex items-center justify-center gap-2 shadow-sm active:scale-95`}
              >
                {isAutoProduce ? '停止自動發送' : '自動發送訊息'}
              </button>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="font-bold text-lg mb-5 flex items-center gap-2 border-b pb-3 text-slate-700">
                <Settings2 className="text-slate-500" size={20} /> 交換機設定
              </h2>
              <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => handleExchangeTypeChange('direct')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${exchangeType === 'direct' ? 'bg-white text-orange-600 shadow' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Direct (直連)
                </button>
                <button
                  onClick={() => handleExchangeTypeChange('fanout')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${exchangeType === 'fanout' ? 'bg-white text-orange-600 shadow' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Fanout (廣播)
                </button>
              </div>
            </div>
            
            <div className="bg-slate-900 text-green-400 p-4 rounded-2xl text-xs font-mono h-48 overflow-hidden relative shadow-inner flex flex-col">
              <div className="text-slate-400 border-b border-slate-700 pb-2 mb-2 font-semibold flex justify-between">
                <span>終端機日誌</span>
                <span className="text-[10px] opacity-50">RabbitMQ Node</span>
              </div>
              <div className="overflow-y-auto flex-1 flex flex-col gap-1 pr-2 custom-scrollbar">
                {logs.map((log) => (
                  <div key={log.id} className="opacity-90 break-all">
                    <span className="text-slate-500 mr-2">[{log.time}]</span>{log.text}
                  </div>
                ))}
                <div ref={endOfLogsRef} />
              </div>
            </div>
          </div>

          {/* 中間：交換機與佇列 */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-orange-200 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-rose-400"></div>
              <GitMerge className="text-orange-500 mb-2" size={32} />
              <h3 className="font-bold text-xl text-slate-800">Exchange (交換機)</h3>
              <span className="mt-1 bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase">
                Mode: {exchangeType}
              </span>
            </div>

            <div className="flex-1 flex flex-col gap-4">
              {queues.map((queue) => (
                <div key={queue.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 relative flex flex-col transition-all">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <List className="text-blue-500" size={18} />
                      <span className="font-bold text-slate-700">{queue.name} ({queue.id})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-mono border border-slate-200">
                        Binding: <strong className="text-orange-600">{queue.bindingKey}</strong>
                      </span>
                      <div className="flex gap-1">
                        <button onClick={() => removeConsumer(queue.id)} className="p-1.5 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors"><Minus size={14}/></button>
                        <button onClick={() => addConsumer(queue.id)} className="p-1.5 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors"><Plus size={14}/></button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-100 rounded-lg border-2 border-slate-200 border-dashed h-16 flex items-center p-2 overflow-hidden relative w-full">
                    <div className="absolute right-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest pointer-events-none">
                      Queue 入口 ⟵
                    </div>
                    <div className="absolute left-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest pointer-events-none">
                      ⟶ 出口 (FIFO)
                    </div>
                    
                    {queue.messages.length === 0 ? (
                      <span className="text-slate-400 text-xs italic w-full text-center relative z-10">佇列空閒中...</span>
                    ) : (
                      <div className="flex gap-2 items-center justify-end w-full relative z-10 pr-16 pl-20">
                        {queue.messages.map((msg) => (
                          <div 
                            key={msg.id} 
                            className={`${msg.color} text-white text-xs font-bold px-3 py-1.5 rounded-md shadow-sm flex-shrink-0 animate-slide-in-right border border-black/10`}
                          >
                            {msg.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右側：消費者 */}
          <div className="lg:col-span-3 bg-slate-50 border-l border-slate-200 p-6 flex flex-col h-full rounded-r-2xl">
             <h2 className="font-bold text-lg mb-5 flex items-center gap-2 border-b border-slate-200 pb-3 text-slate-700">
              <MonitorPlay className="text-emerald-500" size={20} /> 消費者 (Workers)
            </h2>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {consumers.length === 0 && (
                 <div className="text-sm text-slate-400 italic text-center py-4">尚無消費者</div>
              )}
              {consumers.map(consumer => {
                const isProcessing = consumer.state === 'processing';
                const queueColor = consumer.targetQueue === 'Q1' ? 'border-blue-300' : 'border-purple-300';
                
                return (
                  <div key={consumer.id} className={`bg-white p-4 rounded-xl border-2 ${isProcessing ? 'border-emerald-400 shadow-md transform scale-105' : 'border-slate-200'} shadow-sm transition-all duration-300 relative`}>
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-bold text-slate-700 flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${isProcessing ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                        {consumer.id}
                      </span>
                      <span className={`text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold border ${queueColor}`}>
                        監聽: {consumer.targetQueue}
                      </span>
                    </div>
                    
                    <div className={`text-sm h-14 flex flex-col justify-center rounded-lg px-3 border ${isProcessing ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                      {isProcessing && consumer.currentMsg ? (
                        <>
                          <div className="text-[10px] text-emerald-600 font-bold mb-1 flex items-center justify-between">
                            <span>處理中... 等待 Ack</span>
                          </div>
                          <span className={`${consumer.currentMsg.color} text-white px-2 py-0.5 text-xs font-bold rounded shadow-sm w-fit`}>
                            {consumer.currentMsg.text}
                          </span> 
                        </>
                      ) : (
                        <span className="text-xs italic text-slate-400 flex items-center gap-2">
                          <span className="loader-dots">閒置等待任務</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.2s ease-out forwards;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        
        .loader-dots::after {
          content: '.';
          animation: dots 1.5s steps(5, end) infinite;
        }
        @keyframes dots {
          0%, 20% { color: rgba(0,0,0,0); text-shadow: .25em 0 0 rgba(0,0,0,0), .5em 0 0 rgba(0,0,0,0); }
          40% { color: inherit; text-shadow: .25em 0 0 rgba(0,0,0,0), .5em 0 0 rgba(0,0,0,0); }
          60% { text-shadow: .25em 0 0 inherit, .5em 0 0 rgba(0,0,0,0); }
          80%, 100% { text-shadow: .25em 0 0 inherit, .5em 0 0 inherit; }
        }
      `}} />
    </div>
  );
}
