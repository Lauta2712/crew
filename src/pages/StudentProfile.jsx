import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { toSpanishError } from '../utils/errors'

export function StudentProfilePage() {
  const { profile, user } = useAuth()
  const [form, setForm] = useState({ name: '', phone: '' })
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [projects, setProjects] = useState([])
  const [newProject, setNewProject] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [error, setError] = useState(null)
  const avatarInputRef = useRef(null)

  useEffect(() => {
    if (profile) {
      setForm({ name: profile.name ?? '', phone: profile.phone ?? '' })
      setAvatarPreview(null)
    }
  }, [profile])

  const loadProjects = useCallback(async () => {
    if (!profile) return
    setLoadingProjects(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('student_projects')
        .select('*')
        .eq('student_id', profile.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setProjects(data ?? [])
    } catch (err) {
      setError(toSpanishError(err, 'No se pudieron cargar los proyectos.'))
    } finally {
      setLoadingProjects(false)
    }
  }, [profile])

  useEffect(() => { loadProjects() }, [loadProjects])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSaveProfile = async (event) => {
    event.preventDefault()
    if (!profile) return
    setSaving(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('users')
        .update({ name: form.name, phone: form.phone })
        .eq('id', profile.id)
      if (error) throw error
    } catch (err) {
      setError(toSpanishError(err, 'No se pudieron guardar los cambios'))
    } finally {
      setSaving(false)
    }
  }

  const handleAddProject = async (event) => {
    event.preventDefault()
    if (!profile || !newProject.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('student_projects')
        .insert({ student_id: profile.id, name: newProject.trim() })
        .select()
        .single()
      if (error) throw error
      setProjects((prev) => [data, ...prev])
      setNewProject('')
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo guardar el proyecto.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="shrink-0">
        <h1 className="font-display text-base font-bold uppercase tracking-wide text-ink sm:text-lg">Mi perfil</h1>
        <p className="text-xs text-muted">Datos de contacto y proyectos de escalada.</p>
      </div>

      {error && (
        <p className="shrink-0 rounded border border-red-500/40 bg-red-950/40 px-2 py-1.5 text-[11px] text-red-400">
          {error}
        </p>
      )}

      <div className="grid min-h-0 shrink flex-1 grid-cols-1 gap-3 overflow-hidden">
        <form
          onSubmit={handleSaveProfile}
          className="card flex min-h-0 flex-col gap-3 p-3 sm:p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-sm font-semibold text-ink">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Foto de perfil previa" className="h-full w-full object-cover" />
              ) : (
                (profile?.name || profile?.email || '?')
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
              )}
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-ink">
                {profile?.name || 'Tu nombre'}
              </p>
              <button
                type="button"
                className="text-[11px] font-medium text-brand-600 hover:text-brand-400"
                onClick={() => avatarInputRef.current?.click()}
              >
                Cambiar foto
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  setAvatarPreview(URL.createObjectURL(file))
                }}
              />
            </div>
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Datos personales
          </p>
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-[11px] font-medium text-muted">
              Nombre
            </label>
            <input
              id="name"
              name="name"
              className="input py-1.5 text-sm"
              placeholder="Tu nombre"
              value={form.name}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-[11px] font-medium text-muted">
              Correo
            </label>
            <input
              id="email"
              className="input py-1.5 text-sm"
              value={profile?.email ?? user?.email ?? ''}
              disabled
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="phone" className="block text-[11px] font-medium text-muted">
              Teléfono
            </label>
            <input
              id="phone"
              name="phone"
              className="input py-1.5 text-sm"
              placeholder="WhatsApp"
              value={form.phone}
              onChange={handleChange}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary mt-1 w-full py-1.5 text-xs"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>

        <div className="card min-h-0 flex-1 space-y-1.5 overflow-auto p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Proyectos
          </p>
          <form onSubmit={handleAddProject} className="flex flex-col gap-1.5 sm:flex-row">
            <input
              className="input flex-1 py-1.5 text-xs"
              placeholder="Vía o proyecto (ej. 6b)"
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
            />
            <button
              type="submit"
              disabled={saving || !newProject.trim()}
              className="btn-secondary shrink-0 px-2 py-1.5 text-[11px]"
            >
              Añadir
            </button>
          </form>
          {loadingProjects ? (
            <div className="space-y-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-6 animate-pulse rounded bg-surface-2" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <p className="text-[11px] text-muted">Sin proyectos. Añadí tus vías objetivo.</p>
          ) : (
            <ul className="mt-1 grid grid-cols-1 gap-1.5 text-[11px] text-ink sm:grid-cols-2 lg:grid-cols-3">
              {projects.slice(0, 9).map((project) => (
                <li key={project.id} className="rounded border border-line bg-surface px-2 py-1">
                  {project.name}
                </li>
              ))}
              {projects.length > 9 && (
                <li className="text-[10px] text-muted">+{projects.length - 9} más</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
