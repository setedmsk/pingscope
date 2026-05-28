import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";

const quickTargets = ["8.8.8.8", "1.1.1.1", "google.com"];

function normalizeServerUrl(value) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatMethod(result) {
  if (result?.method === "tcp") {
    return result.port ? `TCP:${result.port}` : "TCP";
  }

  return "ICMP";
}

export default function App() {
  const [serverUrl, setServerUrl] = useState("http://localhost:4173");
  const [target, setTarget] = useState("8.8.8.8");
  const [timeoutMs, setTimeoutMs] = useState("2500");
  const [auto, setAuto] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  const normalizedServer = useMemo(() => normalizeServerUrl(serverUrl), [serverUrl]);
  const status = result?.online ? "Online" : result ? "Offline" : "Pronto";
  const latencyLabel = result?.online && result.latencyMs !== null ? `${Math.round(result.latencyMs)} ms` : "--";

  async function ping(nextTarget = target) {
    if (loading) return;
    const cleanTarget = nextTarget.trim();
    const cleanServer = normalizeServerUrl(serverUrl);

    if (!cleanServer) {
      setError("Informe a URL do servidor.");
      return;
    }

    if (!cleanTarget) {
      setError("Informe um IP ou dominio.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${cleanServer}/api/ping`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: cleanTarget,
          timeoutMs,
          count: 1
        })
      });
      const payload = await response.json();

      if (!payload.ok) {
        setError(payload.error || "Falha no ping.");
        return;
      }

      setResult(payload.result);
      setHistory((items) => [payload.result, ...items].slice(0, 30));
    } catch {
      setError("Nao foi possivel acessar o servidor.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (auto) {
      ping();
      timerRef.current = setInterval(() => ping(), 10000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [auto, target, serverUrl, timeoutMs]);

  function selectQuickTarget(value) {
    setTarget(value);
    ping(value);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Network tool</Text>
            <Text style={styles.title}>PingScope</Text>
          </View>
          <View style={[styles.apiPill, normalizedServer ? styles.apiPillOk : styles.apiPillBad]}>
            <Text style={styles.apiPillText}>API</Text>
          </View>
        </View>

        <View style={styles.resultPanel}>
          <View style={[styles.signal, result?.online ? styles.signalOnline : result ? styles.signalOffline : null]}>
            {loading ? <ActivityIndicator color="#101820" /> : <Text style={styles.signalText}>{latencyLabel}</Text>}
          </View>
          <View style={styles.resultText}>
            <Text style={styles.resultLabel}>Status</Text>
            <Text style={styles.statusTitle}>{loading ? "Pingando" : status}</Text>
            <Text style={styles.statusDetail}>
              {error ||
                (result
                  ? `${result.target} - ${formatTime(result.checkedAt)} - ${formatMethod(result)}`
                  : "Aguardando destino.")}
            </Text>
          </View>
        </View>

        <View style={styles.controls}>
          <Text style={styles.label}>Servidor</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setServerUrl}
            placeholder="http://192.168.0.10:4173"
            style={styles.input}
            value={serverUrl}
          />

          <Text style={styles.label}>Destino</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setTarget}
            placeholder="8.8.8.8 ou exemplo.com"
            style={styles.input}
            value={target}
          />

          <View style={styles.quickRow}>
            {quickTargets.map((item) => (
              <Pressable key={item} onPress={() => selectQuickTarget(item)} style={styles.quickButton}>
                <Text style={styles.quickButtonText}>{item}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.settingsRow}>
            <Pressable disabled={loading} onPress={() => ping()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{loading ? "Pingando" : "Pingar"}</Text>
            </Pressable>

            <View style={styles.autoBox}>
              <Text style={styles.autoText}>Auto</Text>
              <Switch onValueChange={setAuto} value={auto} />
            </View>
          </View>

          <View style={styles.timeoutRow}>
            {["1000", "2500", "5000"].map((value) => (
              <Pressable
                key={value}
                onPress={() => setTimeoutMs(value)}
                style={[styles.timeoutButton, timeoutMs === value && styles.timeoutButtonActive]}
              >
                <Text style={[styles.timeoutText, timeoutMs === value && styles.timeoutTextActive]}>
                  {Number(value) / 1000}s
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>Historico</Text>
          <Pressable onPress={() => setHistory([])}>
            <Text style={styles.clearText}>Limpar</Text>
          </Pressable>
        </View>

        <FlatList
          contentContainerStyle={history.length ? styles.historyList : styles.emptyList}
          data={history}
          keyExtractor={(item, index) => `${item.checkedAt}-${index}`}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhum teste ainda</Text>}
          renderItem={({ item }) => (
            <View style={styles.historyItem}>
              <View style={[styles.historyDot, item.online && styles.historyDotOnline]} />
              <View style={styles.historyBody}>
                <Text numberOfLines={1} style={styles.historyTarget}>
                  {item.target}
                </Text>
                <Text style={styles.historyTime}>
                  {formatTime(item.checkedAt)} - {formatMethod(item)}
                </Text>
              </View>
              <Text style={styles.historyLatency}>
                {item.online && item.latencyMs !== null ? `${item.latencyMs} ms` : "offline"}
              </Text>
            </View>
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f4f7f5"
  },
  screen: {
    flex: 1,
    gap: 14,
    padding: 16
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  eyebrow: {
    color: "#2f66d0",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  title: {
    color: "#101820",
    fontSize: 42,
    fontWeight: "900",
    lineHeight: 46
  },
  apiPill: {
    alignItems: "center",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    minWidth: 58
  },
  apiPillOk: {
    backgroundColor: "#effcf6",
    borderColor: "#b7e5d3",
    borderWidth: 1
  },
  apiPillBad: {
    backgroundColor: "#fff2f2",
    borderColor: "#f0c5c5",
    borderWidth: 1
  },
  apiPillText: {
    color: "#101820",
    fontWeight: "900"
  },
  resultPanel: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d9e1de",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 14
  },
  signal: {
    alignItems: "center",
    backgroundColor: "#fff9ef",
    borderColor: "#efd7b7",
    borderRadius: 56,
    borderWidth: 9,
    height: 112,
    justifyContent: "center",
    width: 112
  },
  signalOnline: {
    backgroundColor: "#effcf6",
    borderColor: "#b7e5d3"
  },
  signalOffline: {
    backgroundColor: "#fff2f2",
    borderColor: "#f0c5c5"
  },
  signalText: {
    color: "#101820",
    fontSize: 20,
    fontWeight: "900"
  },
  resultText: {
    flex: 1
  },
  resultLabel: {
    color: "#68737d",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  statusTitle: {
    color: "#101820",
    fontSize: 30,
    fontWeight: "900"
  },
  statusDetail: {
    color: "#68737d",
    lineHeight: 20
  },
  controls: {
    backgroundColor: "#ffffff",
    borderColor: "#d9e1de",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14
  },
  label: {
    color: "#68737d",
    fontSize: 12,
    fontWeight: "900"
  },
  input: {
    borderColor: "#d9e1de",
    borderRadius: 8,
    borderWidth: 1,
    color: "#101820",
    minHeight: 48,
    paddingHorizontal: 12
  },
  quickRow: {
    flexDirection: "row",
    gap: 8
  },
  quickButton: {
    alignItems: "center",
    backgroundColor: "#f8fbfa",
    borderColor: "#d9e1de",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 40,
    justifyContent: "center"
  },
  quickButtonText: {
    color: "#101820",
    fontSize: 12,
    fontWeight: "900"
  },
  settingsRow: {
    flexDirection: "row",
    gap: 10
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#101820",
    borderRadius: 8,
    flex: 1,
    minHeight: 50,
    justifyContent: "center"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "900"
  },
  autoBox: {
    alignItems: "center",
    borderColor: "#d9e1de",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  autoText: {
    color: "#101820",
    fontWeight: "900"
  },
  timeoutRow: {
    flexDirection: "row",
    gap: 8
  },
  timeoutButton: {
    alignItems: "center",
    borderColor: "#d9e1de",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 38,
    justifyContent: "center"
  },
  timeoutButtonActive: {
    backgroundColor: "#2f66d0",
    borderColor: "#2f66d0"
  },
  timeoutText: {
    color: "#101820",
    fontWeight: "900"
  },
  timeoutTextActive: {
    color: "#ffffff"
  },
  historyHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  historyTitle: {
    color: "#101820",
    fontSize: 18,
    fontWeight: "900"
  },
  clearText: {
    color: "#2f66d0",
    fontWeight: "900"
  },
  historyList: {
    gap: 8,
    paddingBottom: 18
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: "center"
  },
  emptyText: {
    color: "#68737d",
    fontWeight: "800",
    textAlign: "center"
  },
  historyItem: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d9e1de",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
    padding: 10
  },
  historyDot: {
    backgroundColor: "#d64545",
    borderRadius: 5,
    height: 10,
    width: 10
  },
  historyDotOnline: {
    backgroundColor: "#1a9b6c"
  },
  historyBody: {
    flex: 1
  },
  historyTarget: {
    color: "#101820",
    fontWeight: "900"
  },
  historyTime: {
    color: "#68737d",
    fontSize: 12
  },
  historyLatency: {
    color: "#101820",
    fontWeight: "900"
  }
});
