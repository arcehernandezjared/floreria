import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, Banknote, CreditCard, Smartphone, CheckCircle, ChevronDown, ChevronUp, X, Lock, Pencil, Check } from 'lucide-react';
import api, { formatMoney, hoyCR } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../store/authStore';

function KpiCaja({ icon: Icon, label, valor, color = 'text-white' }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-4 text-center">
      <Icon size={16} className={`mx-auto mb-1.5 ${color}`} />
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-extrabold tabular-nums ${color}`}>{valor}</p>
    </div>
  );
}

const normFecha = (f) => {
  if (!f) return '';
  if (f instanceof Date) return f.toISOString().split('T')[0];
  const s = String(f);
  return s.includes('T') ? s.split('T')[0] : s.substring(0, 10);
};

function EditarMontoInicial({ fecha, montoActual, onGuardado }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(montoActual);

  const mut = useMutation({
    mutationFn: (monto_inicial) => api.put(`/caja/${fecha}/monto-inicial`, { monto_inicial }),
    onSuccess: () => {
      qc.invalidateQueries(['cierres']);
      qc.invalidateQueries(['caja-actual']);
      toast.success('Monto inicial actualizado');
      setEditando(false);
      onGuardado?.();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al actualizar'),
  });

  if (!editando) {
    return (
      <button onClick={() => { setValor(montoActual); setEditando(true); }}
        className="text-gray-500 hover:text-brand-400 transition-colors" title="Editar monto inicial">
        <Pencil size={12} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input type="number" min="0" step="500" autoFocus
        className="input text-xs py-1 px-2 w-24"
        value={valor} onChange={e => setValor(e.target.value)} />
      <button onClick={() => mut.mutate(parseFloat(valor) || 0)} disabled={mut.isPending}
        className="text-emerald-400 hover:text-emerald-300"><Check size={14} /></button>
      <button onClick={() => setEditando(false)} className="text-gray-500 hover:text-gray-300"><X size={14} /></button>
    </div>
  );
}

function EditarCierre({ fecha, montoInicial, efectivoCaja, onCancelar, onGuardado }) {
  const qc = useQueryClient();
  const [vMonto, setVMonto] = useState(montoInicial);
  const [vEfectivo, setVEfectivo] = useState(efectivoCaja);

  const mut = useMutation({
    mutationFn: () => api.put(`/cierres/${fecha}`, { monto_inicial: parseFloat(vMonto) || 0, efectivo_caja: parseFloat(vEfectivo) || 0 }),
    onSuccess: () => {
      qc.invalidateQueries(['cierres']);
      qc.invalidateQueries(['caja-actual']);
      toast.success('Cierre corregido');
      onGuardado?.();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al corregir'),
  });

  return (
    <div className="bg-gray-900/50 rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Monto inicial</label>
          <input type="number" min="0" step="500" autoFocus className="input text-sm py-1.5"
            value={vMonto} onChange={e => setVMonto(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Efectivo contado</label>
          <input type="number" min="0" step="500" className="input text-sm py-1.5"
            value={vEfectivo} onChange={e => setVEfectivo(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => mut.mutate()} disabled={mut.isPending}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"><Check size={12} /> Guardar</button>
        <button onClick={onCancelar} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"><X size={12} /> Cancelar</button>
      </div>
    </div>
  );
}

function FilaCierre({ c }) {
  const [open, setOpen] = useState(false);
  const [editandoCierre, setEditandoCierre] = useState(false);
  const fechaStr = normFecha(c.fecha);
  const fecha = new Date(fechaStr + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const diferencia = parseFloat(c.diferencia_caja || 0);

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-800/30 transition-colors text-left">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white capitalize">{fecha}</p>
          <p className="text-xs text-gray-500 mt-0.5">{c.ventas_count} ventas · por {c.usuario_nombre || '—'}</p>
        </div>
        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-gray-500">Ingresos</p>
            <p className="text-sm font-bold text-white tabular-nums">{formatMoney(c.ventas_total)}</p>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-xs text-gray-500">Diferencia caja</p>
            <p className={`text-sm font-bold tabular-nums ${Math.abs(diferencia) < 1 ? 'text-emerald-400' : diferencia > 0 ? 'text-sky-400' : 'text-red-400'}`}>
              {formatMoney(diferencia)}
            </p>
          </div>
          {open ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-5 pb-4 pt-1 border-t border-gray-800/60 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Efectivo</p>
                  <p className="text-sm font-bold text-emerald-400">{formatMoney(c.ventas_efectivo)}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Tarjeta</p>
                  <p className="text-sm font-bold text-sky-400">{formatMoney(c.ventas_tarjeta)}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Sinpe</p>
                  <p className="text-sm font-bold text-purple-400">{formatMoney(c.ventas_sinpe)}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-xs text-gray-500">Esperado / Contado</p>
                    {!editandoCierre && (
                      <button onClick={() => setEditandoCierre(true)} className="text-gray-500 hover:text-brand-400" title="Corregir">
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                  <p className="text-sm font-bold text-white">{formatMoney(c.efectivo_esperado)} / {formatMoney(c.efectivo_caja)}</p>
                </div>
              </div>
              {editandoCierre && (
                <EditarCierre
                  fecha={fechaStr}
                  montoInicial={parseFloat(c.monto_inicial) || 0}
                  efectivoCaja={parseFloat(c.efectivo_caja) || 0}
                  onCancelar={() => setEditandoCierre(false)}
                  onGuardado={() => setEditandoCierre(false)}
                />
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Monto inicial</p>
                  <p className="text-sm font-semibold text-gray-300">{formatMoney(c.monto_inicial)}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">N&oacute;mina (provisi&oacute;n)</p>
                  <p className="text-sm font-semibold text-blue-400">{formatMoney(c.costos_total)}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Mermas</p>
                  <p className="text-sm font-semibold text-orange-400">{formatMoney(c.mermas_total)}</p>
                </div>
              </div>
              {c.notas && (
                <div className="bg-gray-900/30 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500 mb-0.5">Notas</p>
                  <p className="text-sm text-gray-300">{c.notas}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CajaPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [montoApertura, setMontoApertura] = useState('');
  const [efectivoContado, setEfectivoContado] = useState('');
  const [notasCierre, setNotasCierre] = useState('');
  const [filtroMes, setFiltroMes] = useState('');

  const crHoy = hoyCR();

  const { data: cajaActual, isLoading: loadingCaja } = useQuery({
    queryKey: ['caja-actual'],
    queryFn: () => api.get('/caja/actual').then(r => r.data.data),
  });

  const { data: cierres = [] } = useQuery({
    queryKey: ['cierres'],
    queryFn: () => api.get('/cierres').then(r => r.data.data),
  });

  const { data: summaryHoy } = useQuery({
    queryKey: ['cierre-summary', crHoy],
    queryFn: () => api.get(`/cierres/summary/${crHoy}`).then(r => r.data.data),
    refetchInterval: 30000,
  });

  const abrirMut = useMutation({
    mutationFn: (data) => api.post('/caja/abrir', data),
    onSuccess: () => {
      qc.invalidateQueries(['caja-actual']);
      toast.success('Caja abierta');
      setMontoApertura('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al abrir caja'),
  });

  const reabrirMut = useMutation({
    mutationFn: () => api.post('/caja/reabrir'),
    onSuccess: () => {
      qc.invalidateQueries(['caja-actual']);
      toast.success('Caja reabierta — ya podés seguir vendiendo');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al reabrir caja'),
  });

  const cierreMut = useMutation({
    mutationFn: (data) => api.post('/cierres', data),
    onSuccess: () => {
      qc.invalidateQueries(['cierres']);
      qc.invalidateQueries(['cierre-check']);
      qc.invalidateQueries(['cierre-summary']);
      qc.invalidateQueries(['caja-actual']);
      qc.invalidateQueries(['termometro']);
      qc.invalidateQueries(['nomina-historial']);
      qc.invalidateQueries(['dashboard']);
      toast.success('Caja cerrada y cierre del día registrado');
      setEfectivoContado('');
      setNotasCierre('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al cerrar caja'),
  });

  const cierreHoy = cierres.find(c => normFecha(c.fecha) === crHoy);
  const cierreHoyExiste = !!cierreHoy;

  // Si ya existe un cierre de hoy (se está reabriendo para actualizar), precargar
  // el efectivo contado anterior para no sobreescribirlo accidentalmente con 0.
  useEffect(() => {
    if (cierreHoy && efectivoContado === '') {
      setEfectivoContado(String(parseFloat(cierreHoy.efectivo_caja) || ''));
    }
  }, [cierreHoy?.efectivo_caja]);

  const getMesKey = (f) => {
    if (!f) return '';
    return f instanceof Date
      ? `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`
      : String(f).substring(0, 7);
  };

  const mesesDisponibles = useMemo(() => {
    const set = new Set(cierres.map(c => getMesKey(c.fecha)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [cierres]);

  const cierresFiltrados = useMemo(() => {
    if (!filtroMes) return cierres;
    return cierres.filter(c => getMesKey(c.fecha) === filtroMes);
  }, [cierres, filtroMes]);

  const s = summaryHoy;
  const efectivoEsperado = s ? parseFloat(s.efectivo_esperado) : 0;
  const diferenciaPreview = efectivoContado ? parseFloat(efectivoContado) - efectivoEsperado : null;

  if (loadingCaja) {
    return <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const cajaAbiertaHoy = cajaActual && cajaActual.estado === 'abierta';
  const cajaCerradaHoy = cajaActual && cajaActual.estado === 'cerrada';

  return (
    <div className="space-y-6 pb-8 animate-fade-in">

      <div>
        <h1 className="text-2xl font-bold text-white">Caja</h1>
        <p className="text-gray-500 text-sm mt-0.5">Apertura, ventas por forma de pago y cierre del día</p>
      </div>

      {/* ── Nunca se abrió caja hoy ── */}
      {!cajaActual && (
        <div className="card border-yellow-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center">
              <Lock size={18} className="text-yellow-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Caja cerrada</h2>
              <p className="text-xs text-gray-500">Abre la caja con el monto inicial antes de vender hoy</p>
            </div>
          </div>
          <div className="flex gap-3">
            <input type="number" min="0" step="500" className="input flex-1" placeholder="Monto inicial en efectivo (₡)"
              value={montoApertura} onChange={e => setMontoApertura(e.target.value)} />
            <button onClick={() => abrirMut.mutate({ monto_inicial: parseFloat(montoApertura) || 0 })}
              disabled={abrirMut.isPending} className="btn-primary px-6">
              {abrirMut.isPending ? 'Abriendo...' : 'Abrir caja'}
            </button>
          </div>
        </div>
      )}

      {/* ── Caja ya cerrada hoy — permitir reabrir si llega otra venta ── */}
      {cajaCerradaHoy && (
        <div className="card border-emerald-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle size={18} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Caja cerrada hoy</h2>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                Monto inicial {formatMoney(cajaActual.monto_inicial)} · cerrada a las{' '}
                {cajaActual.cerrada_en ? new Date(cajaActual.cerrada_en).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' }) : '—'}
                <EditarMontoInicial fecha={crHoy} montoActual={parseFloat(cajaActual.monto_inicial) || 0} />
              </p>
            </div>
          </div>
          {s && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              <KpiCaja icon={Banknote} label="Efectivo" valor={formatMoney(s.ventas_efectivo)} color="text-emerald-400" />
              <KpiCaja icon={CreditCard} label="Tarjeta" valor={formatMoney(s.ventas_tarjeta)} color="text-sky-400" />
              <KpiCaja icon={Smartphone} label="Sinpe" valor={formatMoney(s.ventas_sinpe)} color="text-purple-400" />
            </div>
          )}
          <button onClick={() => reabrirMut.mutate()} disabled={reabrirMut.isPending} className="btn-primary w-full justify-center py-3">
            <Wallet size={16} /> {reabrirMut.isPending ? 'Reabriendo...' : 'Reabrir caja — voy a vender más hoy'}
          </button>
        </div>
      )}

      {/* ── Caja abierta — resumen del día ── */}
      {cajaAbiertaHoy && (
        <>
          <div className="card">
            <div className="flex items-center gap-3 mb-5">
              <CheckCircle size={20} className="text-emerald-400" />
              <div>
                <h2 className="text-base font-bold text-white">Caja abierta hoy</h2>
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  Monto inicial {formatMoney(cajaActual.monto_inicial)} · por {cajaActual.usuario_nombre || '—'}
                  <EditarMontoInicial fecha={crHoy} montoActual={parseFloat(cajaActual.monto_inicial) || 0} />
                </p>
              </div>
            </div>

            {s && (
              <div className="grid grid-cols-3 gap-3 mb-5">
                <KpiCaja icon={Banknote} label="Efectivo" valor={formatMoney(s.ventas_efectivo)} color="text-emerald-400" />
                <KpiCaja icon={CreditCard} label="Tarjeta" valor={formatMoney(s.ventas_tarjeta)} color="text-sky-400" />
                <KpiCaja icon={Smartphone} label="Sinpe" valor={formatMoney(s.ventas_sinpe)} color="text-purple-400" />
              </div>
            )}

            <div className="bg-gray-800/40 rounded-xl px-4 py-3 mb-5 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Monto inicial (con el que abriste hoy)</span>
                <span className="text-gray-300 tabular-nums">{formatMoney(cajaActual.monto_inicial)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">+ Ventas en efectivo de hoy</span>
                <span className="text-gray-300 tabular-nums">{s ? formatMoney(s.ventas_efectivo) : '—'}</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-700 pt-1.5 mt-1">
                <span className="text-sm text-gray-300 font-medium">= Efectivo esperado en caja</span>
                <span className="text-lg font-bold text-white tabular-nums">{formatMoney(efectivoEsperado)}</span>
              </div>
            </div>

            <div className="space-y-3 border-t border-gray-800 pt-4">
              {cierreHoyExiste && (
                <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5 mb-1">
                  <CheckCircle size={15} className="text-emerald-400 flex-shrink-0" />
                  <p className="text-sm text-emerald-300">Cierre de hoy registrado. Si vendiste más después, podés actualizarlo.</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Efectivo contado en caja (₡)</label>
                  <input type="number" min="0" step="500" className="input"
                    placeholder="¿Cuánto hay realmente en caja?"
                    value={efectivoContado} onChange={e => setEfectivoContado(e.target.value)} />
                </div>
                <div>
                  <label className="label">Diferencia vs. esperado</label>
                  <div className={`input font-bold tabular-nums ${
                    diferenciaPreview === null ? 'text-gray-500' : Math.abs(diferenciaPreview) < 1 ? 'text-emerald-400' : diferenciaPreview > 0 ? 'text-sky-400' : 'text-red-400'
                  }`}>
                    {diferenciaPreview === null ? '—' : formatMoney(diferenciaPreview)}
                  </div>
                </div>
              </div>
              <div>
                <label className="label">Notas del cierre (opcional)</label>
                <textarea className="input resize-none" rows={2}
                  placeholder="Observaciones del día, incidentes, notas..."
                  value={notasCierre} onChange={e => setNotasCierre(e.target.value)} />
              </div>
              <button
                onClick={() => cierreMut.mutate({
                  fecha: crHoy,
                  efectivo_caja: parseFloat(efectivoContado) || 0,
                  notas: notasCierre,
                  usuario_nombre: user?.nombre || ''
                })}
                disabled={cierreMut.isPending}
                className="btn-primary w-full justify-center py-3">
                <Wallet size={16} />
                {cierreMut.isPending ? 'Guardando...' : cierreHoyExiste ? 'Actualizar cierre de caja' : 'Cerrar caja del día'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Historial ── */}
      {cierres.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <h2 className="text-base font-bold text-white w-full sm:w-auto sm:mr-auto">Historial de cierres de caja</h2>
            <div>
              <label className="label text-xs mb-1 block">Por mes</label>
              <select className="input text-sm py-2 w-44" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
                <option value="">Todos los meses</option>
                {mesesDisponibles.map(mes => {
                  const [y, m] = mes.split('-');
                  const label = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' });
                  return <option key={mes} value={mes}>{label}</option>;
                })}
              </select>
            </div>
            {filtroMes && (
              <button onClick={() => setFiltroMes('')} className="btn-secondary text-xs py-2 px-3 flex items-center gap-1">
                <X size={13} /> Limpiar
              </button>
            )}
          </div>

          {cierresFiltrados.map(c => <FilaCierre key={c.id} c={c} />)}
        </div>
      )}

      {cierres.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          Aún no hay cierres de caja registrados
        </div>
      )}
    </div>
  );
}
