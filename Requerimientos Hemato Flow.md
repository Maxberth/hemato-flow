REQUERIMIENTOS HEMATOFLOW

**Descripción Breve:** El sistema debe permitir a los pacientes prioritariamente que radican en zonas lejanas al INSN reservar y avisar cuando tendrán sus próximas citas en el consultorio médico. La comunicación se realizará mediante WhatsApp/Telegram. Esto será mediante comunicación con un agente de IA. el cual se encargará de la generación y ayuda en la creación de citas según el historial médico y la etiqueta (Asignada por el médico a cargo) de cada uno de los pacientes (Siempre con la confirmación y auditoría del médico a cargo), al crear la organización se les notificará a cada uno de los pacientes su cita, el agente notificará segGuido al paciente, según que tan lejos se encuentre del hospital, si no se recibe alguna respuesta el agente notificará de manera automática **al asistente social,** para que se contacte directamente con la familia, si el paciente falta de igual manera a la cita, el agente preguntara el “¿Por qué?”, para saber la causa más frecuente de faltas del paciente, al faltar el agente lo reprograma junto a otros pacientes (Según la etiqueta que el médico le asignó a cada paciente), colocando a los que tengan etiqueta de mayor prioridad a en fechas más cercanas con baja demanda, de igual manera toda la reprogramación será auditada por el médico, confirmando si es correcta o necesito hacer cambios, al aceptar la reprogramación el agente notificará a cada uno de los pacientes reprogramados.

Actores:  
Asistente social.  
Administrador Médico.  
Paciente.

**Requisitos Funcionales (RF) \- (IA A REVISAR)**

* **Gestión de Capacidad y Cohorte:** El sistema debe permitir cargar pacientes elegibles junto con su prioridad y fecha objetivo, así como gestionar la capacidad semanal, recursos y espacios (slots) disponibles. (SISTEMA)  
* **Motor de Planificación:** Debe generar propuestas de citas combinando la prioridad operativa y restricciones duras, comparando la ocupación para asignar cupos preferentemente en días de baja demanda normalizada. (SISTEMA)  
* **Aprobación Médica:** El sistema tiene que presentar un lote pendiente a revisión, donde el médico puede aprobarlo (lo cual crea citas, consume cupos y encola avisos) o rechazarlo (lo cual cierra el lote sin cambiar la agenda). (SISTEMA)  
* **Notificaciones Asíncronas:** Las alertas deben calcularse y encolarse con distintos tiempos de anticipación dependiendo de la distancia geográfica de los pacientes (bandas cercana, regional y distante). (BOT)  
* **Seguimiento y Trabajo Social:** El sistema debe detectar silencios o inasistencias (no-shows) y generar automáticamente tareas visibles y con nivel de servicio (SLA) para la intervención de Trabajo Social.(BOT)  
* **Reprogramación Segura:** Ante una inasistencia, se debe liberar el cupo original solo una vez y obligar a que la nueva propuesta de fecha pase nuevamente por el flujo de aprobación médica. (BOT)

**Requisitos No Funcionales (RNF)**

* **Arquitectura y Ecosistema:** La aplicación debe estar estructurada como un desarrollo full-stack utilizando Next.js (App Router) y TypeScript, compatible con infraestructuras Serverless.  
* **Persistencia (Fase MVP y Futuro):** En su estado actual, debe gestionar un estado de inmutabilidad utilizando snapshots secuenciales JSON en almacenamiento Blob privado (Vercel) con detección de conflictos (HTTP 409). A futuro, exige una base transaccional en PostgreSQL.  
* **Determinismo y Cero Sobrecupo:** Las reglas son estrictas; bajo ninguna circunstancia el sistema debe crear espacios inexistentes (sobrecupos) ni relajar restricciones para encajar una cita.  
* **Auditoría y Trazabilidad:** Todo cambio operativo, especialmente las aprobaciones clínicas, debe registrar de manera inmutable el actor (revisor) y el momento del suceso.  
* **IA Responsable:** Si se activa un modelo de lenguaje (LLM), este debe limitarse únicamente a explicar de manera legible la propuesta de cita planificada. La IA tiene completamente prohibido tomar decisiones clínicas, diagnosticar, cambiar agendas o aprobar cupos autónomamente.  
* **Privacidad y Seguridad:** Exige minimización de datos sensibles y debe migrar progresivamente de contraseñas compartidas hacia modelos de autenticación de inicio de sesión único (SSO), MFA y control de accesos basado en roles (RBAC) antes de usarse con pacientes reales.

