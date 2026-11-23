import { canales } from './config.js';

export const normas = {
  titulo: '📜 Normativa Oficial — Tmb Studio',
  texto: [
    '**1. Respeto absoluto:** Trata con respeto a todos los miembros y al equipo de administración. No se toleran insultos, acoso, toxicidad ni faltas de respeto hacia otros participantes.',
    '**2. Lenguaje apto (Cero contenido "funable"):** Queda estrictamente prohibido cualquier comentario discriminatorio, racista, homófobo, político, sexual o contenido NSFW/gore. Mantén un lenguaje limpio y apto para YouTube tanto en los foros como en los canales de voz.',
    '**3. Uso correcto del Foro:** Utiliza el canal de Foro-Tmb únicamente para aportar sugerencias, resolver dudas sobre eventos o comentar vídeos, siempre usando la etiqueta correspondiente. Prohibido el spam, el flood o desviar los hilos con temas irrelevantes.',
    '**4. Cero autopromoción y enlaces externos:** No está permitido hacer spam de otros servidores de Discord, canales de YouTube/Twitch o redes sociales, ni enviar enlaces sospechosos por el servidor o por mensaje directo (MD) a otros miembros.',
    '**5. Privacidad y seguridad (Zero Doxing):** Prohibido compartir información personal propia o de terceros (IPs, nombres reales, fotos, ubicaciones), así como filtrar datos o spoilers de eventos en curso.',
    '**6. Criterio de administración:** El equipo de Tmb Studio se reserva el derecho de sancionar, mutear o expulsar de forma directa a cualquier usuario que altere el orden del servidor o incumpla el espíritu de estas normas, incluso si la acción exacta no aparece descrita arriba.',
  ].join('\n\n'),
};

export const servidor = {
  titulo: '🎬 Bienvenido a Tmb Studio',
  texto: [
    'Tmb Studio es una productora independiente dedicada a la creación de eventos competitivos y experimentos sociales de alto nivel en Minecraft, diseñados exclusivamente para YouTube.',
    'Este servidor funciona como nuestro centro oficial de convocatorias y producción, manteniendo una estructura limpia y sin ruido para que nunca te pierdas una oportunidad de participar.',
    '### 📌 ¿Cómo funciona el servidor?',
    `• **Convocatorias e Inscripciones:** Cada vez que vayamos a grabar un nuevo evento, lo anunciaremos en <#${canales.convocatorias}> junto con el formulario de inscripción y los requisitos específicos.`,
    '• **Selección de participantes:** Evaluamos cada solicitud buscando compromiso, buen audio y ganas de competir limpio. Si eres elegido, el día del evento estarás en la lista blanca para poder participar.',
    `• <#${canales.foroTmb}>: Es nuestro único espacio abierto a la comunidad. Úsalo de forma ordenada (y con su etiqueta correspondiente) para charlar y hablar con demás usuarios de la comunidad.`,
    `• <#${canales.infoSoporte}>: Si necesitas soporte o información, en este canal dispondrás de todo a tu alcance.`,
  ].join('\n\n'),
};

export const eventos = {
  titulo: '🎮 Funcionamiento de los Eventos — Tmb Studio',
  texto: [
    'Nuestros eventos están diseñados como experiencias competitivas, psicológicas y de supervivencia de formato cerrado, pensadas para crear una narrativa única en cada vídeo.',
    '### 📋 Fases de cada evento',
    '**1. Convocatoria abierta:** Publicamos la temática, fecha y hora exacta de grabación junto con el formulario de inscripción oficial.',
    '**2. Filtro y selección:** Al tratarse de eventos exclusivos con plazas muy limitadas, seleccionamos a los participantes valorando su disponibilidad, calidad de micrófono y compromiso con las normas.',
    '**3. Confirmación privada:** Si resultas seleccionado, recibirás un aviso previo para que sepas que estás admitido en la lista blanca del evento.',
    '**4. Grabación y producción:** El día acordado se grabará todo lo que digáis, cómo os comportéis y vuestro personaje en el evento. Todo el evento se graba de principio a fin y posteriormente pasa por edición antes de estrenarse en YouTube.',
    '### 🏆 Premios y condiciones',
    '• Los eventos con recompensa económica se entregan exclusivamente según la política del premio en el formulario del evento al ganador oficial, una vez revisada y validada la partida.',
  ].join('\n\n'),
};

export const normativaEvento = {
  titulo: '📜 Normativa de los Eventos — Tmb Studio',
  intro: 'Al participar en los eventos de Tmb Studio, aceptas las siguientes condiciones:',
  secciones: [
    ['🎮 Juego limpio', 'Jugar limpio **sin clientes modificados, macros ni ventajas externas**, comprometiéndote a no aprovecharte de bugs, fallos del mapa o mecánicas rotas (debiendo **reportarlos al instante** si los encuentras), respetando las dinámicas de cada ronda y evitando cualquier tipo de **ghosting o ayuda externa** una vez eliminado.'],
    ['🎙️ Grabación', 'Para garantizar una buena grabación, está prohibido **saturar el micrófono**, reproducir audios externos, interrumpir a los administradores cuando explican las normas o usar lenguaje ofensivo y no apto.'],
    ['⏰ Compromiso', 'Se exige **puntualidad** y pleno respeto a las decisiones que tome la administración.'],
    ['🔐 Seguridad', 'Para proteger a nuestros usuarios y evitar **multicuentas** y **robos de identidad**, al ser aceptado recibirás un **código de verificación** que deberás introducir al entrar al servidor. Mientras dure el evento guardaremos de forma privada la conexión (IP) desde la que te verifiques, y solo la usaremos por motivos de seguridad. Cualquier intento de entrar con tu nametag sin el código correcto será **bloqueado permanentemente**.'],
    ['⚠️ Consecuencias', 'Si incumples cualquiera de estas normas, asumes la **descalificación inmediata**, la **pérdida total de cualquier premio** obtenido y la **expulsión de futuros eventos**.'],
  ],
};

export const politicaPremios = {
  titulo: '🏆 Política de Premios',
  texto: 'Al marcar esta casilla, confirmas ser plenamente consciente de que participas en este evento compitiendo por un **premio real**, el cual se entregará **única y exclusivamente en formato de tarjeta regalo digital** (sin posibilidad de canje por dinero en efectivo ni transferencias directas) al **ganador oficial** una vez validada la grabación.\n\nEl incumplimiento de cualquiera de las normas del evento, el abandono injustificado o cualquier conducta antideportiva detectada durante o después de la partida supondrá la **anulación automática del premio** sin derecho a reclamación.',
};
