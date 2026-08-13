# PENDIENTES — crux-admin

Cosas a revisar, mejorar o implementar. Ordenadas por prioridad aproximada.

---

## 🔴 Revisar / bugs conocidos

### `schedule_slot` — columna inexistente en `attendances`
La columna `schedule_slot` no existe en la tabla `attendances` de Supabase. Ya se eliminó del payload de inserción en `CheckinManual.jsx` y `AttendanceScanView.jsx`, pero quedan dos cosas pendientes:
- Decidir si se agrega la columna a la DB (y habilitarla en el código) o si se elimina definitivamente el selector de slot de la UI del panel manual del coach (`AttendanceScanView.jsx`).
- Por ahora el coach ve el selector de "Horario específico" pero el valor no se guarda.

### Check-in manual coach — asistencia muro libre + clase el mismo día
Se modificó `CoachCheckinPage.jsx` para que la detección de duplicado sea **por tipo** (muro libre vs. clases/grupo), no por cualquier asistencia del día. Esto permite que un alumno tenga registradas ambas asistencias en el mismo día de forma independiente.

**Testear:**
- Alumno con clase registrada hoy → el check-in manual de muro libre debe habilitarse y registrarse correctamente.
- Alumno con muro libre registrado hoy → el check-in manual de clase/grupo debe habilitarse y registrarse correctamente.
- Alumno que ya tiene muro libre hoy → segundo intento de muro libre debe bloquearse ("Ya tiene asistencia hoy").
- Alumno que ya tiene clase hoy → segundo intento de clase debe bloquearse.
- Verificar que el aviso "Ya tiene asistencia hoy." sigue apareciendo correctamente en los casos de duplicado real.

---

## 🟡 Funcionalidades nuevas solicitadas

### Pago "Pendiente"
El admin quiere poder registrar un pago como **Pendiente** para habilitar al alumno antes de cobrar (cuando el alumno paga en un par de días). Implica:
- Agregar columna `status` (o similar) a la tabla `payments` (`pendiente` / `pagado`).
- Ajustar la lógica de validación de QR para aceptar pagos pendientes dentro de un período de gracia.
- Mostrar visualmente en `Estudiantes` si el alumno tiene un pago pendiente.
- Posiblemente un flujo para marcar el pago como cobrado desde el admin.

### Elegir fecha al registrar un pago
Actualmente los pagos siempre se registran con la fecha y hora actuales (`new Date()`). Se quiere poder elegir una fecha manualmente (para registrar pagos retroactivos o futuros).
- Aplica a `AdminPayments.jsx` (Escuelas, Grupo) y a `Students.jsx` (modal de pago — actualmente deshabilitado).
- Usar `DatePicker` (ya existe el componente).
- Marcar como **Beta** cuando se implemente.

---

## 🟢 Mejoras / deuda técnica

### Dead code en `Students.jsx`
`handleRegisterPayment`, `savingPayment` y `paymentError` siguen en el archivo pero ya no se usan (se quitó `onRegisterPayment` del render de `StudentTable`). Limpiar cuando haya oportunidad.

### Responsive — pantallas no revisadas en detalle
Se mejoró el responsive de Dashboard, Pagos, Estudiantes, Asistencias y Check-in Manual. Pendiente revisar en mobile con más cuidado:
- `AdminConfiguration.jsx` — formularios de precios y horarios
- `Coaches.jsx` — lista de profesores + formulario de creación
- `CoachDashboard.jsx` — panel del coach

### Beta badges — revisar alcance
Actualmente solo `Check-in Manual` tiene el badge. Cuando se implemente **Pago Pendiente** o **Elegir fecha en pagos**, agregarles el badge también. Revisar si alguna otra funcionalidad existente merece el badge.

### `AttendanceScanView` — panel manual del coach
El coach ve el panel "Cámara QR" y el panel "Manual" (con tabs en mobile). El manual hace validación completa de packs. Confirmar que este comportamiento es el deseado para coaches o si también debería ser "solo cámara".

---

## 💡 Ideas / backlog

- **Historial de pagos por alumno** — ver desde `Estudiantes` todos los pagos de un alumno sin ir a otra pantalla.
- **Notificaciones de pack por vencer** — alertar al admin cuando a un alumno le quedan pocas clases o el pack vence pronto.
- **Exportar asistencias a CSV** — similar a la exportación de lista de alumnos que ya existe.
