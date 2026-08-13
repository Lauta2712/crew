import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { buildCatalogFromSettingsJson } from '../utils/gymSettingsMerge'
import { applyTheme, applyBrandChrome } from '../utils/theme'

const GymSettingsContext = createContext(null)

/** Nombre mostrado cuando el gimnasio no tiene `gyms.name` cargado (o no hay sesión aún). */
const DEFAULT_GYM_DISPLAY_NAME = 'Tu gimnasio'

export function GymSettingsProvider({ children }) {
  const { profile } = useAuth()
  const [row, setRow] = useState(null)
  const [gymName, setGymName] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!profile?.id) {
      setRow(null)
      setGymName(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('gym_settings')
        .select('id, gym_id, data, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)

      if (profile.gym_id != null && profile.gym_id !== '') {
        query = query.eq('gym_id', profile.gym_id)
      } else {
        query = query.is('gym_id', null)
      }

      const [{ data, error: qErr }, gymRes] = await Promise.all([
        query.maybeSingle(),
        profile.gym_id != null && profile.gym_id !== ''
          ? supabase.from('gyms').select('name').eq('id', profile.gym_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (qErr) throw qErr
      setRow(data ?? null)
      setGymName(gymRes?.data?.name ?? null)
    } catch (e) {
      setError(e)
      setRow(null)
      setGymName(null)
    } finally {
      setLoading(false)
    }
  }, [profile?.id, profile?.gym_id])

  useEffect(() => {
    load()
  }, [load])

  const catalog = useMemo(() => buildCatalogFromSettingsJson(row?.data), [row?.data])

  // Si el gimnasio tiene `theme` configurado, pisa el tema de bootstrap (env vars, ver
  // main.jsx). Sin theme configurado no hace nada — quedan los defaults de index.css.
  useEffect(() => {
    applyTheme(catalog.theme)
  }, [catalog.theme])

  // Título de pestaña / favicon: una vez resuelto el gym_id real, refina lo que puso el
  // bootstrap de env vars con el nombre y logo reales de este gimnasio (gyms.name, theme.logoUrl).
  useEffect(() => {
    if (!gymName) return
    applyBrandChrome({
      name: gymName,
      logoUrl: catalog.theme?.logoUrl,
      primaryColor: catalog.theme?.primaryColor,
    })
  }, [gymName, catalog.theme])

  const saveSettingsData = useCallback(
    async (data) => {
      if (profile?.role !== 'admin') {
        throw new Error('Solo administradores pueden guardar la configuración.')
      }
      const gymId = profile.gym_id != null && profile.gym_id !== '' ? profile.gym_id : null
      const payload = {
        data: data ?? {},
        updated_at: new Date().toISOString(),
      }
      if (row?.id) {
        const { error: uErr } = await supabase.from('gym_settings').update(payload).eq('id', row.id)
        if (uErr) throw uErr
      } else {
        const { error: iErr } = await supabase.from('gym_settings').insert([{ gym_id: gymId, ...payload }])
        if (iErr) throw iErr
      }
      await load()
    },
    [profile?.role, profile?.gym_id, row?.id, load],
  )

  const value = useMemo(
    () => ({
      loading,
      error,
      settingsRow: row,
      rawSettings: row?.data ?? {},
      ...catalog,
      gymName: gymName || DEFAULT_GYM_DISPLAY_NAME,
      reload: load,
      saveSettingsData,
    }),
    [loading, error, row, catalog, gymName, load, saveSettingsData],
  )

  return <GymSettingsContext.Provider value={value}>{children}</GymSettingsContext.Provider>
}

export function useGymCatalog() {
  const ctx = useContext(GymSettingsContext)
  if (!ctx) {
    throw new Error('useGymCatalog debe usarse dentro de GymSettingsProvider')
  }
  return ctx
}
