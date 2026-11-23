// IDs del servidor. Cámbialos aquí si algún día cambian.

// Niveles de autoridad: un nivel incluye a todos los superiores (nivel 2 = roles de nivel 2, 3, 4 y 5)
export const niveles = {
  1: ['1569447061886341191'],
  2: ['1573624899069677588'],
  3: ['1573624806505455736'],
  4: ['1573625233678663740'],
  5: ['1573625386351202456', '1558370548105351248'],
};

export const canales = {
  convocatorias: '1558370951756914789',
  foroTmb: '1558371250986950666',
  infoSoporte: '1573610235430441121', // canal con el menú de Información / Soporte
};

export const verificacion = {
  canalId: '1573609725785014376', // canal donde están las normas y el formulario
  rolSinVerificarId: '1558370515389784114', // rol que recibe al entrar
  rolVerificadoId: '1558370481948725308', // rol que recibe al terminar
  foroRegistroId: '1573611695010746459', // foro privado donde se guardan los formularios

  // Preguntas del formulario (máximo 5).
  // tipo: 'casillas' (varias), 'unica' (solo una) o texto (por defecto; estilo 'corto' o 'largo')
  preguntas: [
    {
      id: 'conociste', tipo: 'casillas', texto: '¿Cómo nos has conocido?', descripcion: 'Puedes marcar varias',
      opciones: ['Invitación de conocido', 'YouTube', 'TikTok', 'Otras redes sociales', 'Otro'],
    },
    {
      id: 'actividad', tipo: 'unica', texto: '¿Cuánta será tu actividad en el servidor?', descripcion: 'Elige solo una',
      opciones: ['Baja', 'Media', 'Alta', 'Siempre que pueda'],
    },
    { id: 'motivo', texto: '¿Por qué quieres unirte?', estilo: 'largo', max: 500 },
  ],
};

export const eventos = {
  registroId: '1573610493988311100', // donde llegan los formularios completados
  nivelPublicar: 5, // /formulario
  nivelAceptar: 5, // botón "Aceptar usuario"
  minutosParaCompletar: 30, // si no lo termina en este tiempo, el canal se borra
  rolMencionarId: '1558370481948725308', // rol "Miembro" que se menciona al publicar con /crearevento
  ubicacion: 'Minecraft · Tmb Studio', // lugar que aparece en el evento de Discord
  asistenciaId: '1573814148763222037', // canal donde se apunta quién se conecta durante cada evento
  margenFinMin: 60, // se sigue apuntando gente hasta X minutos después de la hora de fin del evento
};

export const casos = {
  categoriaId: '1573624085005738085', // categoría donde se crean los canales caso-...
  registros: { // dónde se guarda cada tipo de caso al cerrarse
    reporte: '1573610405979361310',
    ayuda: '1573620362636300328',
    postu: '1573620408341504081',
  },
  nivelVer: 1, // desde qué nivel ven los casos y reciben el aviso
  nivelGestionar: 2, // /caso cerrar, unir, expulsar
  nivelReabrir: 3, // /caso reabrir
};

const P_USUARIO = [
  { id: 'usuario', texto: 'Usuario que quieres reportar', estilo: 'corto', max: 100 },
  { id: 'motivo', texto: 'Motivo', estilo: 'largo', max: 1500 },
];
const P_OCURRIDO = [{ id: 'ocurrido', texto: '¿Qué ha ocurrido?', estilo: 'largo', max: 1500 }];
const P_POSTU = [
  { id: 'porque', texto: 'Explica por qué quieres postularte', estilo: 'largo', max: 1000 },
  { id: 'aportar', texto: '¿Cómo podrías aportar?', estilo: 'largo', max: 1000 },
  { id: 'estudio', texto: '¿Por qué te gustaría estar en este estudio?', estilo: 'largo', max: 1000 },
];

// Cada tipo de caso: tipo = reporte | ayuda | postu (decide el nombre del canal y el registro)
export const tiposCaso = {
  'reporte-usuario-mc': { tipo: 'reporte', etiqueta: 'Reporte de usuario en Minecraft', volver: 'nav:reportar-usuario', preguntas: P_USUARIO },
  'reporte-usuario-dc': { tipo: 'reporte', etiqueta: 'Reporte de usuario en Discord', volver: 'nav:reportar-usuario', preguntas: P_USUARIO },
  'reporte-discord': { tipo: 'reporte', etiqueta: 'Reporte de Discord', volver: 'nav:reportar', preguntas: P_OCURRIDO },
  'reporte-evento': { tipo: 'reporte', etiqueta: 'Reporte de un evento', volver: 'nav:reportar', preguntas: P_OCURRIDO },
  'ayuda-evento': { tipo: 'ayuda', etiqueta: 'Ayuda de Evento', volver: 'nav:ayuda', preguntas: P_OCURRIDO },
  'ayuda-discord': { tipo: 'ayuda', etiqueta: 'Ayuda de Discord', volver: 'nav:ayuda', preguntas: P_OCURRIDO },
  'ayuda-general': { tipo: 'ayuda', etiqueta: 'Ayuda General', volver: 'nav:ayuda', preguntas: P_OCURRIDO },
  postulacion: { tipo: 'postu', etiqueta: 'Postulación Estudio', volver: 'nav:soporte', preguntas: P_POSTU },

  // Casos abiertos por el staff con /abrircaso
  'staff-reporte': { tipo: 'reporte', etiqueta: 'Reporte (abierto por el staff)' },
  'staff-ayuda': { tipo: 'ayuda', etiqueta: 'Ayuda (abierto por el staff)' },
  'staff-postu': { tipo: 'postu', etiqueta: 'Postulación Estudio (abierto por el staff)' },
};

// Verificación en Minecraft con el código que se envía al aceptar el formulario del evento
export const verificacionMc = {
  segundos: 90, // tiempo para poner /verificacion CODIGO antes del ban-ip
  modoJuego: 'adventure', // modo al verificarse (mientras tanto, espectador)
  banSiSale: true, // si sale sin verificarse y no vuelve a tiempo para poner el código, también ban-ip
  seguridadId: '1573814148763222037', // foro donde se avisa de verificaciones y baneos (publicación «🔐 Seguridad»)
};
