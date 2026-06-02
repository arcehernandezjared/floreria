import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flower2, Eye, EyeOff } from 'lucide-react';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(email, password);
    if (result.success) {
      toast.success('Bienvenida a Alma Caribeña');
      navigate('/dashboard');
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl mb-4 shadow-lg shadow-brand-600/30">
            <Flower2 size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Alma Caribeña</h1>
          <p className="text-gray-400 mt-1">Sistema de Gestión Floristería</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold text-white mb-6">Iniciar sesión</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Correo electrónico</label>
              <input type="email" className="input" placeholder="admin@floreria.com"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} className="input pr-12"
                  placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={isLoading}
              className="w-full btn-primary justify-center py-3 text-base mt-2">
              {isLoading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
          <p className="text-xs text-gray-600 text-center mt-4">
           
          </p>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Alma Caribeña v1.0 — Floristería Artesanal
        </p>
      </motion.div>
    </div>
  );
}
