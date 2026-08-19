-- Crea el gimnasio por defecto de este deploy — necesario porque
-- src/constants/gym.js hardcodea DEFAULT_GYM_ID, y useAuth.jsx se lo asigna
-- a todo alumno que se registra. Sin esta fila, el signup de un alumno
-- funcionaría pero quedaría con un gym_id "huérfano" (sin fila real en
-- gyms), rompiendo cualquier lectura que dependa del join a gyms.
INSERT INTO public.gyms (id, name)
VALUES ('0c758fed-a971-4051-ab3d-77e3363d18da', 'Crew')
ON CONFLICT (id) DO NOTHING;
