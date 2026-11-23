package es.tmbstudio.verificacion;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.text.minimessage.tag.resolver.Placeholder;
import net.kyori.adventure.title.Title;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerPreLoginEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Verificación de identidad para los eventos de Tmb Studio.
 *
 * El bot de Discord escribe codigos.json (nametag -> código) y ejecuta "tmbverif reload".
 * El plugin guarda en ips.json la IP desde la que cada jugador se verificó.
 * Todo lo importante se escribe en consola con el prefijo [TMBV] para que el bot lo lea y avise en Discord:
 *   [TMBV] PENDIENTE nametag ip
 *   [TMBV] VERIFICADO nametag ip
 *   [TMBV] BAN nametag ip motivo
 *   [TMBV] RECHAZADO nametag ip duplicado|ip-distinta
 *   [TMBV] RESET nametag
 */
public final class TmbVerificacion extends JavaPlugin implements Listener {

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private final MiniMessage mm = MiniMessage.miniMessage();

    /** nametag (minúsculas) -> código (de codigos.json, lo escribe el bot) */
    private final Map<String, String> codigos = new ConcurrentHashMap<>();
    /** nametag (minúsculas) -> verificación guardada (ips.json) */
    private final Map<String, Verificado> verificados = new ConcurrentHashMap<>();
    /** jugadores conectados (minúsculas), para rechazar duplicados desde el hilo asíncrono */
    private final Set<String> conectados = ConcurrentHashMap.newKeySet();
    /** jugadores pendientes de poner el código */
    private final Map<String, Pendiente> pendientes = new HashMap<>();

    private File archivoCodigos;
    private File archivoIps;
    private long modificadoCodigos = -1;

    record Verificado(String ip, String codigo, long cuando) {}

    static final class Pendiente {
        final String nametag;
        String ip;
        final Location origen;
        final long limite;
        final List<BukkitTask> tareas = new ArrayList<>();

        Pendiente(String nametag, String ip, Location origen, long limite) {
            this.nametag = nametag;
            this.ip = ip;
            this.origen = origen;
            this.limite = limite;
        }
    }

    // ─── Arranque ───────────────────────────────────────────────────────────
    @Override
    public void onEnable() {
        saveDefaultConfig();
        getDataFolder().mkdirs();
        archivoCodigos = new File(getDataFolder(), "codigos.json");
        archivoIps = new File(getDataFolder(), "ips.json");
        cargarIps();
        cargarCodigos(true);
        for (Player p : Bukkit.getOnlinePlayers()) conectados.add(clave(p.getName()));
        getServer().getPluginManager().registerEvents(this, this);
        // Por si el bot cambia el archivo y no llega el "reload": se revisa cada 30 s
        Bukkit.getScheduler().runTaskTimer(this, () -> cargarCodigos(false), 600L, 600L);
        getLogger().info("Verificación activa: " + codigos.size() + " jugador(es) con código, " + verificados.size() + " verificado(s).");
    }

    @Override
    public void onDisable() {
        pendientes.values().forEach(p -> p.tareas.forEach(BukkitTask::cancel));
        pendientes.clear();
    }

    // ─── Archivos ───────────────────────────────────────────────────────────
    private static String clave(String nametag) {
        return nametag.toLowerCase(Locale.ROOT);
    }

    /** Lee codigos.json. Si cambió algún código o desapareció un jugador, se borra su IP verificada. */
    private synchronized void cargarCodigos(boolean forzar) {
        if (!archivoCodigos.exists()) {
            if (forzar) getLogger().warning("Todavía no hay codigos.json (lo crea el bot de Discord al aceptar formularios).");
            return;
        }
        long mod = archivoCodigos.lastModified();
        if (!forzar && mod == modificadoCodigos) return;
        modificadoCodigos = mod;
        try {
            String texto = Files.readString(archivoCodigos.toPath(), StandardCharsets.UTF_8);
            JsonObject raiz = JsonParser.parseString(texto).getAsJsonObject();
            JsonObject jugadores = raiz.has("jugadores") ? raiz.getAsJsonObject("jugadores") : new JsonObject();
            Map<String, String> nuevos = new HashMap<>();
            for (String k : jugadores.keySet()) {
                JsonObject j = jugadores.getAsJsonObject(k);
                if (j.has("codigo")) nuevos.put(clave(k), j.get("codigo").getAsString());
            }
            codigos.clear();
            codigos.putAll(nuevos);

            // Códigos cambiados o eliminados -> su IP verificada deja de valer
            boolean cambios = verificados.entrySet().removeIf(e -> !e.getValue().codigo().equals(codigos.get(e.getKey())));
            if (cambios) guardarIps();

            // Pendientes que ya no tienen código (formularios eliminados): se les libera
            Bukkit.getScheduler().runTask(this, () -> {
                for (String k : new ArrayList<>(pendientes.keySet())) {
                    if (codigos.containsKey(k)) continue;
                    Pendiente p = pendientes.remove(k);
                    p.tareas.forEach(BukkitTask::cancel);
                    Player jugador = Bukkit.getPlayerExact(p.nametag);
                    if (jugador != null) liberar(jugador, p);
                }
            });
            getLogger().info("Códigos cargados: " + codigos.size() + " jugador(es).");
        } catch (Exception e) {
            getLogger().severe("No se pudo leer codigos.json: " + e.getMessage());
        }
    }

    private void cargarIps() {
        verificados.clear();
        if (!archivoIps.exists()) return;
        try {
            JsonObject raiz = JsonParser.parseString(Files.readString(archivoIps.toPath(), StandardCharsets.UTF_8)).getAsJsonObject();
            for (String k : raiz.keySet()) {
                JsonObject v = raiz.getAsJsonObject(k);
                verificados.put(k, new Verificado(v.get("ip").getAsString(), v.get("codigo").getAsString(), v.get("cuando").getAsLong()));
            }
        } catch (Exception e) {
            getLogger().severe("No se pudo leer ips.json: " + e.getMessage());
        }
    }

    private synchronized void guardarIps() {
        JsonObject raiz = new JsonObject();
        verificados.forEach((k, v) -> {
            JsonObject o = new JsonObject();
            o.addProperty("ip", v.ip());
            o.addProperty("codigo", v.codigo());
            o.addProperty("cuando", v.cuando());
            raiz.add(k, o);
        });
        try {
            File tmp = new File(getDataFolder(), "ips.json.tmp");
            Files.writeString(tmp.toPath(), GSON.toJson(raiz), StandardCharsets.UTF_8);
            Files.move(tmp.toPath(), archivoIps.toPath(), StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            getLogger().severe("No se pudo guardar ips.json: " + e.getMessage());
        }
    }

    private boolean estaVerificado(String k) {
        Verificado v = verificados.get(k);
        return v != null && v.codigo().equals(codigos.get(k));
    }

    // ─── Mensajes ───────────────────────────────────────────────────────────
    private Component msg(String ruta, String tiempo) {
        String texto = getConfig().getString("mensajes." + ruta, "");
        return mm.deserialize(texto, Placeholder.unparsed("tiempo", tiempo == null ? "" : tiempo));
    }

    private static String tiempo(long segundos) {
        long m = segundos / 60, s = segundos % 60;
        if (m > 0 && s > 0) return m + " min " + s + " s";
        if (m > 0) return m + (m == 1 ? " minuto" : " minutos");
        return s + " segundos";
    }

    private static String ipDe(Player p) {
        return p.getAddress() != null ? p.getAddress().getAddress().getHostAddress() : "desconocida";
    }

    private void log(String linea) {
        getLogger().info("[TMBV] " + linea);
    }

    // ─── Antes de entrar: duplicados e IP distinta ──────────────────────────
    @EventHandler(priority = EventPriority.HIGHEST)
    public void alPreEntrar(AsyncPlayerPreLoginEvent e) {
        if (e.getLoginResult() != AsyncPlayerPreLoginEvent.Result.ALLOWED) return;
        String nombre = e.getName();
        String k = clave(nombre);
        String ip = e.getAddress().getHostAddress();

        if (getConfig().getBoolean("bloquear-duplicados", true) && conectados.contains(k)) {
            e.disallow(AsyncPlayerPreLoginEvent.Result.KICK_OTHER, msg("rechazo-duplicado", null));
            log("RECHAZADO " + nombre + " " + ip + " duplicado");
            return;
        }
        if (getConfig().getBoolean("solo-ip-verificada", true) && estaVerificado(k) && !verificados.get(k).ip().equals(ip)) {
            e.disallow(AsyncPlayerPreLoginEvent.Result.KICK_OTHER, msg("rechazo-ip", null));
            log("RECHAZADO " + nombre + " " + ip + " ip-distinta");
        }
    }

    // ─── Al entrar: pedir código ────────────────────────────────────────────
    @EventHandler(priority = EventPriority.MONITOR)
    public void alEntrar(PlayerJoinEvent e) {
        Player p = e.getPlayer();
        String k = clave(p.getName());
        conectados.add(k);
        if (!codigos.containsKey(k)) return; // no es jugador de ningún evento (staff, etc.)
        String ip = ipDe(p);
        if (estaVerificado(k) && verificados.get(k).ip().equals(ip)) return;

        Pendiente pend = pendientes.get(k);
        if (pend != null) {
            pend.ip = ip; // volvió a entrar sin verificarse: el plazo sigue corriendo
        } else {
            int segundos = Math.max(10, getConfig().getInt("segundos", 90));
            pend = new Pendiente(p.getName(), ip, p.getLocation(), System.currentTimeMillis() + segundos * 1000L);
            pendientes.put(k, pend);
            final Pendiente fp = pend;
            fp.tareas.add(Bukkit.getScheduler().runTaskLater(this, () -> banear(k, "No introdujo el código a tiempo"), segundos * 20L));
            if (segundos > 45) {
                fp.tareas.add(Bukkit.getScheduler().runTaskLater(this, () -> {
                    Player j = Bukkit.getPlayerExact(fp.nametag);
                    if (j != null && pendientes.get(k) == fp) j.sendMessage(msg("recordatorio", null));
                }, (segundos - 30) * 20L));
            }
        }
        log("PENDIENTE " + p.getName() + " " + ip + " " + pend.limite);

        long quedan = Math.max(0, (pend.limite - System.currentTimeMillis()) / 1000);
        p.setGameMode(GameMode.SPECTATOR);
        p.showTitle(Title.title(msg("titulo", tiempo(quedan)), msg("subtitulo", tiempo(quedan)),
                Title.Times.times(Duration.ofMillis(500), Duration.ofSeconds(6), Duration.ofSeconds(1))));
        p.sendMessage(msg("pedir-codigo", tiempo(quedan)));
    }

    @EventHandler
    public void alSalir(PlayerQuitEvent e) {
        String k = clave(e.getPlayer().getName());
        conectados.remove(k);
        if (!getConfig().getBoolean("ban-si-sale", true)) {
            Pendiente p = pendientes.remove(k);
            if (p != null) p.tareas.forEach(BukkitTask::cancel);
        }
    }

    // ─── Verificación y ban ─────────────────────────────────────────────────
    private void liberar(Player p, Pendiente pend) {
        if (pend.origen != null) p.teleport(pend.origen);
        GameMode modo;
        try {
            modo = GameMode.valueOf(getConfig().getString("modo-juego", "ADVENTURE").toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            modo = GameMode.ADVENTURE;
        }
        p.setGameMode(modo);
    }

    private void banear(String k, String motivo) {
        Pendiente p = pendientes.remove(k);
        if (p == null) return;
        p.tareas.forEach(BukkitTask::cancel);
        log("BAN " + p.nametag + " " + p.ip + " " + motivo);
        // ban-ip expulsa al momento a cualquiera conectado desde esa IP y nunca se quita solo
        Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "ban-ip " + p.ip + " " + getConfig().getString("mensajes.motivo-ban", "Bloqueado por seguridad"));
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (command.getName().equalsIgnoreCase("verificacion")) return comandoVerificacion(sender, args);
        return comandoAdmin(sender, args);
    }

    private boolean comandoVerificacion(CommandSender sender, String[] args) {
        if (!(sender instanceof Player p)) {
            sender.sendMessage("Solo para jugadores.");
            return true;
        }
        String k = clave(p.getName());
        Pendiente pend = pendientes.get(k);
        if (pend == null) {
            p.sendMessage(msg(codigos.containsKey(k) ? "ya-verificado" : "no-necesitas", null));
            return true;
        }
        if (args.length == 0) {
            p.sendMessage(msg("uso", null));
            return true;
        }
        String codigo = args[0].trim();
        if (!codigo.equals(codigos.get(k))) {
            banear(k, "Código incorrecto");
            return true;
        }
        pendientes.remove(k);
        pend.tareas.forEach(BukkitTask::cancel);
        String ip = ipDe(p);
        verificados.put(k, new Verificado(ip, codigo, System.currentTimeMillis()));
        guardarIps();
        liberar(p, pend);
        p.showTitle(Title.title(msg("titulo-verificado", null), msg("subtitulo-verificado", null)));
        p.sendMessage(msg("verificado", null));
        log("VERIFICADO " + p.getName() + " " + ip);
        return true;
    }

    private boolean comandoAdmin(CommandSender sender, String[] args) {
        String sub = args.length > 0 ? args[0].toLowerCase(Locale.ROOT) : "estado";
        switch (sub) {
            case "reload" -> {
                reloadConfig();
                cargarCodigos(true);
                sender.sendMessage("TmbVerificacion: recargado (" + codigos.size() + " códigos).");
            }
            case "reset" -> {
                if (args.length < 2) {
                    sender.sendMessage("Uso: /tmbverif reset <nametag>");
                    return true;
                }
                boolean habia = verificados.remove(clave(args[1])) != null;
                guardarIps();
                log("RESET " + args[1]);
                sender.sendMessage(habia ? "IP verificada de " + args[1] + " borrada: podrá verificarse desde otra conexión."
                        : args[1] + " no tenía IP verificada.");
            }
            default -> sender.sendMessage("TmbVerificacion: " + codigos.size() + " códigos, " + verificados.size()
                    + " verificados, " + pendientes.size() + " pendientes.");
        }
        return true;
    }
}
