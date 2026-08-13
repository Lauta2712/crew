# delete-student

Hard delete de un estudiante:
- valida que el caller sea `admin` (según `public.users.role`)
- borra `payments`, `attendances`, `subscriptions`, `student_projects`
- borra la fila del estudiante en `public.users`
- borra el usuario también en `Auth` (`auth.admin.deleteUser`) para liberar el mail

## Body esperado
```json
{ "student_id": "uuid" }
```

