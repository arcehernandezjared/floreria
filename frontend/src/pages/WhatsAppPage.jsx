import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Wifi, WifiOff, Bot, User, Zap, Loader, PhoneOff, Smartphone, Key } from 'lucide-react';
import { io } from 'socket.io-client';
import { formatMoney } from '../utils/api';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PAISES = [
  { nombre: 'Costa Rica',        codigo: '506', bandera: '🇨🇷' },
  { nombre: 'México',            codigo: '52',  bandera: '🇲🇽' },
  { nombre: 'Guatemala',         codigo: '502', bandera: '🇬🇹' },
  { nombre: 'Honduras',          codigo: '504', bandera: '🇭🇳' },
  { nombre: 'El Salvador',       codigo: '503', bandera: '🇸🇻' },
  { nombre: 'Nicaragua',         codigo: '505', bandera: '🇳🇮' },
  { nombre: 'Panamá',            codigo: '507', bandera: '🇵🇦' },
  { nombre: 'Colombia',          codigo: '57',  bandera: '🇨🇴' },
  { nombre: 'Venezuela',         codigo: '58',  bandera: '🇻🇪' },
  { nombre: 'Ecuador',           codigo: '593', bandera: '🇪🇨' },
  { nombre: 'Perú',              codigo: '51',  bandera: '🇵🇪' },
  { nombre: 'Bolivia',           codigo: '591', bandera: '🇧🇴' },
  { nombre: 'Chile',             codigo: '56',  bandera: '🇨🇱' },
  { nombre: 'Argentina',         codigo: '54',  bandera: '🇦🇷' },
  { nombre: 'Uruguay',           codigo: '598', bandera: '🇺🇾' },
  { nombre: 'Paraguay',          codigo: '595', bandera: '🇵🇾' },
  { nombre: 'Brasil',            codigo: '55',  bandera: '🇧🇷' },
  { nombre: 'República Dominicana', codigo: '1809', bandera: '🇩🇴' },
  { nombre: 'Cuba',              codigo: '53',  bandera: '🇨🇺' },
  { nombre: 'Estados Unidos',    codigo: '1',   bandera: '🇺🇸' },
  { nombre: 'España',            codigo: '34',  bandera: '🇪🇸' },
];

const EJEMPLOS = [
  '¿Cuántas rosas rojas quedan en stock?',
  'Dame el resumen de ventas de hoy',
  'Pagué la luz ₡15,000',
  'Se marchitaron 5 rosas en tienda',
  '¿Cómo hago una venta en el sistema?',
  '¿Cómo funciona el cierre del día?',
  '¿Qué pedidos están pendientes?',
  '¿Cómo agrego un arreglo nuevo al catálogo?',
  '¿Cómo funciona el ahorro de sueldos?',
  '¿Cuánto hemos vendido esta semana?',
  'Vendí un ramo de rosas a María por 15000',
  '¿Cómo registro una compra de flores?'
];

export default function WhatsAppPage() {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [waStatus, setWaStatus] = useState('disconnected');
  const [connecting, setConnecting] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [paisSeleccionado, setPaisSeleccionado] = useState(null);
  const [pairingCode, setPairingCode] = useState(null);
  const [qrImage, setQrImage] = useState(null);
  const [modoConexion, setModoConexion] = useState('qr'); // 'qr' | 'codigo'
  const [codeTimer, setCodeTimer] = useState(0);
  const timerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const inputRef = useRef(null);
  const qc = useQueryClient();

  useEffect(() => {
    const socket = io('https://floreria-2-sszs.onrender.com', {
  transports: ['websocket', 'polling']
});
    socketRef.current = socket;

    socket.on('connect', () => {
      try {
        const empresaId = JSON.parse(atob(localStorage.getItem('floreria_token').split('.')[1])).empresa_id;
        socket.emit('join_empresa', empresaId);
      } catch {}
    });

    socket.on('wa_pairing_code', ({ code }) => {
      setPairingCode(code);
      setConnecting(false);
      setCodeTimer(55);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCodeTimer(t => {
          if (t <= 1) { clearInterval(timerRef.current); return 0; }
          return t - 1;
        });
      }, 1000);
      toast.success('¡Código listo! Ingrésalo en WhatsApp AHORA', { duration: 8000 });
    });

    socket.on('wa_qr', ({ qr }) => {
      setQrImage(qr);
      setConnecting(false);
      toast('Escanea el QR con WhatsApp', { icon: '📷', duration: 8000 });
    });

    socket.on('wa_status', ({ status }) => {
      setWaStatus(status);
      if (status === 'connected') {
        setPairingCode(null);
        setQrImage(null);
        setConnecting(false);
        toast.success('¡WhatsApp conectado exitosamente!');
        qc.invalidateQueries(['wa-status']);
      }
      if (status === 'pairing') {
        setConnecting(false);
      }
      if (status === 'disconnected') {
        setConnecting(false);
      }
      if (status === 'error') {
        setConnecting(false);
        setPairingCode(null);
        setQrImage(null);
      }
    });

    socket.on('wa_mensaje', ({ numero }) => {
      toast(`Mensaje de ${numero}`, { icon: '💬', duration: 3000 });
    });

    return () => socket.disconnect();
  }, []);

  const { data: statusData } = useQuery({
    queryKey: ['wa-status'],
    queryFn: () => api.get('/whatsapp/status').then(r => r.data.data),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (statusData) setWaStatus(statusData.status);
  }, [statusData]);

  const connectMutation = useMutation({
    mutationFn: () => {
      if (modoConexion === 'qr') {
        return api.post('/whatsapp/connect', { forceNew: true });
      }
      const phone = phoneNumber.replace(/\D/g, '');
      if (!phone) throw new Error('Ingresa tu número de teléfono');
      return api.post('/whatsapp/connect', { phoneNumber: phone });
    },
    onMutate: () => { setConnecting(true); setQrImage(null); setPairingCode(null); },
    onSuccess: () => toast(modoConexion === 'qr' ? 'Generando QR...' : 'Generando código, espera ~3 segundos...', { icon: '⏳', duration: 5000 }),
    onError: (err) => {
      setConnecting(false);
      toast.error(err.message || err.response?.data?.message || 'Error al conectar');
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.post('/whatsapp/disconnect'),
    onSuccess: () => {
      setWaStatus('disconnected');
      setPairingCode(null);
      toast.success('WhatsApp desconectado');
    }
  });

  const chatMutation = useMutation({
    mutationFn: (data) => api.post('/whatsapp/chat', data),
    onSuccess: (res, variables) => {
      const respuesta = res.data.respuesta;
      setChatHistory(prev => [...prev, { role: 'assistant', content: respuesta, timestamp: new Date() }]);
      setHistorial(prev => {
        const updated = [...prev, { role: 'user', content: variables.mensaje }, { role: 'assistant', content: respuesta }];
        return updated.slice(-20);
      });
    },
    onError: () => toast.error('Error al procesar mensaje')
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSend = () => {
    const msg = message.trim();
    if (!msg || chatMutation.isPending) return;
    setChatHistory(prev => [...prev, { role: 'user', content: msg, timestamp: new Date() }]);
    chatMutation.mutate({ mensaje: msg, historial: historial.slice(-10) });
    setMessage('');
    inputRef.current?.focus();
  };

  const isConnected = waStatus === 'connected';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">WhatsApp IA</h1>
          <p className="text-gray-500 text-sm">Asistente de Floristería Alma Caribeña</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge ${isConnected ? 'badge-green' : waStatus === 'pairing' ? 'badge-yellow' : 'badge-red'}`}>
            {isConnected
              ? <><Wifi size={12} /> Conectado</>
              : waStatus === 'pairing'
              ? <><Key size={12} /> Esperando código</>
              : <><WifiOff size={12} /> Desconectado</>}
          </span>
          {isConnected && (
            <button onClick={() => disconnectMutation.mutate()} className="btn-danger text-sm">
              <PhoneOff size={14} /> Desconectar
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat IA */}
        <div className="lg:col-span-2 card p-0 flex flex-col" style={{ height: '580px' }}>
          <div className="p-4 border-b border-gray-800 flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Bot size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">Agente NexusAdmin</p>
              <p className="text-xs text-brand-400">Powered by Claude AI · Floristería Alma Caribeña</p>
            </div>
            {isConnected && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Activo en WA
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatHistory.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-14 h-14 bg-brand-600/15 rounded-2xl flex items-center justify-center mb-4">
                  <Zap size={24} className="text-brand-400" />
                </div>
                <p className="text-gray-300 font-medium">Hola, soy tu asistente IA</p>
                <p className="text-gray-600 text-sm mt-1 max-w-xs">
                  Gestiono tu inventario, ventas, clientes y cobros por mensaje de texto natural.
                </p>
                <p className="text-gray-700 text-xs mt-3">Prueba con algún ejemplo del panel derecho →</p>
              </div>
            )}
            <AnimatePresence>
              {chatHistory.map((msg, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-brand-600/20 border border-brand-600/30 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot size={13} className="text-brand-400" />
                    </div>
                  )}
                  <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-brand-600 text-white rounded-tr-sm'
                      : 'bg-gray-800 text-gray-200 rounded-tl-sm border border-gray-700'
                  }`}>
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="markdown-chat">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                    <p className={`text-xs mt-1.5 ${msg.role === 'user' ? 'text-brand-200' : 'text-gray-600'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0 mt-1">
                      <User size={13} className="text-gray-400" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {chatMutation.isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-brand-600/20 border border-brand-600/30 flex items-center justify-center">
                  <Bot size={13} className="text-brand-400" />
                </div>
                <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 border border-gray-700">
                  <div className="flex gap-1.5 items-center">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-2 h-2 bg-brand-500 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-gray-800">
            <div className="flex gap-2.5">
              <input
                ref={inputRef}
                className="input flex-1 text-sm"
                placeholder="Escribe un mensaje al asistente..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || chatMutation.isPending}
                className="btn-primary px-4 text-sm"
              >
                <Send size={15} />
              </button>
            </div>
            <p className="text-xs text-gray-700 mt-2">Enter para enviar · El agente recuerda el contexto de la conversación</p>
          </div>
        </div>

        {/* Panel lateral */}
        <div className="space-y-4">

          {/* Vincular WhatsApp */}
          {!isConnected && (
            <div className="card border-brand-500/20">
              <div className="flex items-center gap-2 mb-4">
                <Smartphone size={16} className="text-brand-400" />
                <p className="text-sm font-semibold text-white flex-1">Vincular WhatsApp</p>
              </div>

              {/* Toggle QR / Código */}
              {!pairingCode && !qrImage && (
                <div className="flex rounded-lg bg-gray-800 p-0.5 mb-4 text-xs font-medium">
                  <button
                    onClick={() => setModoConexion('qr')}
                    className={`flex-1 py-1.5 rounded-md transition-all ${modoConexion === 'qr' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    📷 Código QR
                  </button>
                  <button
                    onClick={() => setModoConexion('codigo')}
                    className={`flex-1 py-1.5 rounded-md transition-all ${modoConexion === 'codigo' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    🔢 Código numérico
                  </button>
                </div>
              )}

              <AnimatePresence mode="wait">
                {/* ── QR generado ── */}
                {qrImage && (
                  <motion.div key="qr-image" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="text-center">
                    <p className="text-xs text-brand-300 font-medium mb-3">Escanea con WhatsApp</p>
                    <img src={qrImage} alt="QR WhatsApp" className="w-48 h-48 mx-auto rounded-xl border border-gray-700 bg-white p-1" />
                    <div className="text-xs text-gray-500 space-y-1 text-left bg-gray-800/50 rounded-lg p-3 mt-3">
                      <p className="font-medium text-gray-400 mb-1">Cómo escanear:</p>
                      <p>1. Abre WhatsApp en tu celular</p>
                      <p>2. Menú (⋮) → <strong className="text-gray-300">Dispositivos vinculados</strong></p>
                      <p>3. Toca <strong className="text-gray-300">"Vincular un dispositivo"</strong></p>
                      <p>4. Apunta la cámara al QR de arriba</p>
                    </div>
                    <p className="text-xs text-yellow-500 mt-2">⏱ El QR expira en ~60 segundos</p>
                    <button
                      onClick={() => connectMutation.mutate()}
                      disabled={connecting || connectMutation.isPending}
                      className="mt-2 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                    >
                      {connecting ? 'Actualizando...' : '↺ Generar nuevo QR'}
                    </button>
                  </motion.div>
                )}

                {/* ── Pairing code generado ── */}
                {pairingCode && (
                  <motion.div key="code" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="text-center">
                    <div className="flex items-center gap-2 justify-center mb-3">
                      <Key size={14} className="text-yellow-400" />
                      <p className="text-xs text-yellow-300 font-medium">Código de emparejamiento</p>
                    </div>
                    <div className="bg-gray-900 border border-yellow-500/30 rounded-xl py-4 px-6 mb-4">
                      <p className="text-3xl font-mono font-bold text-yellow-300 tracking-[0.3em]">
                        {pairingCode}
                      </p>
                    </div>
                    <div className="text-xs text-gray-500 space-y-1.5 text-left bg-gray-800/50 rounded-lg p-3">
                      <p className="font-medium text-gray-400 mb-2">Cómo ingresar el código:</p>
                      <p>1. Abre WhatsApp en tu celular</p>
                      <p>2. Menú (⋮) → <strong className="text-gray-300">Dispositivos vinculados</strong></p>
                      <p>3. Toca <strong className="text-gray-300">"Vincular un dispositivo"</strong></p>
                      <p>4. Toca <strong className="text-gray-300">"Vincular con número de teléfono"</strong></p>
                      <p>5. Ingresa el código de arriba</p>
                    </div>
                    <p className={`text-xs mt-3 font-mono font-bold ${codeTimer <= 15 ? 'text-red-400 animate-pulse' : 'text-yellow-500'}`}>
                      ⏱ Expira en {codeTimer}s
                    </p>
                    <button
                      onClick={() => { setPairingCode(null); setConnecting(false); }}
                      className="mt-3 text-xs text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      Cancelar y volver
                    </button>
                  </motion.div>
                )}

                {/* ── Formulario inicial ── */}
                {!pairingCode && !qrImage && (
                  <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {modoConexion === 'qr' ? (
                      <div>
                        <p className="text-xs text-gray-500 mb-3">
                          Generá un código QR y escanealo desde tu celular. No requiere ingresar número.
                        </p>
                        <button
                          onClick={() => connectMutation.mutate()}
                          disabled={connecting || connectMutation.isPending}
                          className="btn-primary w-full text-sm"
                        >
                          {connecting
                            ? <><Loader size={14} className="animate-spin" /> Generando QR...</>
                            : <><Smartphone size={14} /> Mostrar código QR</>
                          }
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-gray-500 mb-1.5">
                          1. Selecciona tu país <span className="text-red-400">*</span>
                        </p>
                        <select
                          className="input w-full text-sm mb-3"
                          value={paisSeleccionado?.codigo || ''}
                          onChange={e => {
                            const pais = PAISES.find(p => p.codigo === e.target.value);
                            setPaisSeleccionado(pais || null);
                            setPhoneNumber(pais ? pais.codigo : '');
                          }}
                        >
                          <option value="">-- Selecciona un país --</option>
                          {PAISES.map(p => (
                            <option key={p.codigo} value={p.codigo}>
                              {p.bandera} {p.nombre} (+{p.codigo})
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mb-1.5">
                          2. Ingresa tu número <span className="text-red-400">*</span>
                        </p>
                        <div className="flex rounded-lg overflow-hidden border border-gray-700 mb-1 focus-within:border-brand-500 transition-colors">
                          <div className="flex items-center gap-1 px-2.5 bg-gray-800 border-r border-gray-700 shrink-0 text-xs text-gray-300 font-mono whitespace-nowrap">
                            {paisSeleccionado
                              ? <><span>{paisSeleccionado.bandera}</span><span>+{paisSeleccionado.codigo}</span></>
                              : <span className="text-gray-600">+--</span>
                            }
                          </div>
                          <input
                            className="flex-1 min-w-0 bg-gray-900 text-sm text-white px-3 py-2 outline-none font-mono placeholder-gray-600"
                            placeholder={paisSeleccionado ? 'Ej: 85002402' : 'Selecciona un país primero'}
                            disabled={!paisSeleccionado}
                            value={paisSeleccionado ? phoneNumber.slice(paisSeleccionado.codigo.length) : ''}
                            onChange={e => {
                              if (!paisSeleccionado) return;
                              const local = e.target.value.replace(/\D/g, '').slice(0, 10);
                              setPhoneNumber(paisSeleccionado.codigo + local);
                            }}
                          />
                        </div>
                        <p className="text-xs mb-3 font-mono min-h-[1rem]">
                          {paisSeleccionado && phoneNumber.length > paisSeleccionado.codigo.length
                            ? <span className="text-gray-500">Número completo: <span className="text-gray-400">+{phoneNumber}</span></span>
                            : <span className="text-transparent">-</span>
                          }
                        </p>
                        <button
                          onClick={() => connectMutation.mutate()}
                          disabled={connecting || connectMutation.isPending || !paisSeleccionado || phoneNumber.length <= paisSeleccionado?.codigo?.length}
                          className="btn-primary w-full text-sm"
                        >
                          {connecting
                            ? <><Loader size={14} className="animate-spin" /> Generando código...</>
                            : <><Smartphone size={14} /> Generar código de emparejamiento</>
                          }
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Estado conectado */}
          {isConnected && (
            <div className="card border-green-500/20 text-center">
              <div className="w-12 h-12 bg-green-500/15 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Wifi size={22} className="text-green-400" />
              </div>
              <p className="text-green-400 font-semibold text-sm">WhatsApp Activo</p>
              <p className="text-xs text-gray-500 mt-1">El asistente está respondiendo mensajes automáticamente</p>
              <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-green-500">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> En línea
              </span>
            </div>
          )}

          {/* Ejemplos */}
          <div className="card">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Ejemplos de preguntas</p>
            <div className="space-y-1.5">
              {EJEMPLOS.map((e, i) => (
                <button key={i} onClick={() => { setMessage(e); inputRef.current?.focus(); }}
                  className="w-full text-left text-xs text-gray-400 hover:text-white bg-gray-800/50 hover:bg-gray-800 px-3 py-2 rounded-lg transition-all border border-transparent hover:border-gray-700">
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Capacidades */}
          <div className="card">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">El agente puede</p>
            <ul className="space-y-1.5 text-xs text-gray-500">
              {[
                '✅ Consultar stock de flores e insumos',
                '✅ Registrar mermas por motivo',
                '✅ Ver ventas y resumen del día',
                '✅ Buscar arreglos del catálogo',
                '✅ Estado del fondo de nómina',
                '✅ Alertas de stock crítico',
                '✅ Reportes por período',
                '✅ Recordar contexto de conversación'
              ].map((cap, i) => <li key={i}>{cap}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
