// IDs del servidor. Cámbialos aquí si algún día cambian.
export const verificacion = {
  canalId: '1573609725785014376', // canal donde está el formulario
  rolSinVerificarId: '1558370515389784114', // rol que recibe al entrar
  rolVerificadoId: '1558370481948725308', // rol que recibe al terminar
  foroRegistroId: '1573611695010746459', // foro privado donde se guardan los formularios

  // Preguntas del formulario (máximo 5). estilo: 'corto' o 'largo'
  preguntas: [
    { id: 'conociste', texto: '¿Cómo conociste este servidor?', estilo: 'corto', max: 100 },
    { id: 'edad', texto: '¿Cuántos años tienes?', estilo: 'corto', max: 3 },
    { id: 'motivo', texto: '¿Por qué quieres unirte?', estilo: 'largo', max: 500 },
  ],
};
