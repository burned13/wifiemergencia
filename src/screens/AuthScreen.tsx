import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors } from '../theme/colors';
import { StepProgress } from '../components/StepProgress';
import { useAuthStore } from '../contexts/useAuthStore';
import { AuthService } from '../services/authService';
import { OfflineStorageService } from '../utils/offlineStorage';
import { useWifiStore } from '../contexts/useWifiStore';

interface AuthScreenProps {
  onAuthSuccess: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ssid, setSsid] = useState('');
  const [registerCode, setRegisterCode] = useState('');
  const [isExistingSsid, setIsExistingSsid] = useState(false);
  const [didAutoLogin, setDidAutoLogin] = useState(false);

  const { signUp, signIn, isLoading, error, clearError, signUpWithRegister, isAuthenticated } = useAuthStore() as any;
  const [info, setInfo] = useState<string | null>(null);
  const [hasPayments, setHasPayments] = useState(false);
  const [hasRegistered, setHasRegistered] = useState(false);
  const { myNetworks } = useWifiStore() as any;

  useEffect(() => {
    try {
      const params = new URLSearchParams((typeof window !== 'undefined' ? window.location.search : '') || '');
      const qEmail = params.get('email');
      const qPassword = params.get('password');
      const qUsername = params.get('username');
      const qSsid = params.get('ssid');
      const qCode = params.get('code');
      if (qEmail) setEmail(qEmail);
      if (qPassword) setPassword(qPassword);
      if (qUsername) setUsername(qUsername || '');
      if (qSsid) setSsid(qSsid);
      if (qCode) setRegisterCode(qCode);
      (async () => {
        if (qEmail && qPassword && !isSignUp && !didAutoLogin) {
          clearError();
          await signIn(qEmail, qPassword);
          if (!error) onAuthSuccess();
          setDidAutoLogin(true);
        }
      })();
    } catch {}
  }, [isSignUp, clearError, signIn, error, onAuthSuccess, didAutoLogin]);

  useEffect(() => {
    (async () => {
      try {
        const paid = await OfflineStorageService.getHasCompletedPayments();
        const reg = await OfflineStorageService.getHasRegisteredNetwork();
        setHasPayments(!!paid);
        setHasRegistered(!!reg);
      } catch {}
    })();
  }, [isAuthenticated]);

  useEffect(() => {
    try {
      const hasAny = Array.isArray(myNetworks) && myNetworks.length > 0;
      if (hasAny) setHasRegistered(true);
    } catch {}
  }, [myNetworks]);

  const doneSteps = [false, false, false] as boolean[];
  const computeCurrentStep = () => 1;

  const handleSubmit = async () => {
    clearError();

    if (!email || !password) {
      Alert.alert('Error', 'Completá todos los campos');
      return;
    }

    if (isSignUp) {
      if (!username || password !== confirmPassword) {
        Alert.alert('Error', 'Usuario requerido y las contraseñas deben coincidir');
        return;
      }
      if (isExistingSsid) {
        if (!ssid.trim() || !registerCode.trim()) {
          Alert.alert('Error', 'Ingresá la SSID y el código de registro');
          return;
        }
        await signUpWithRegister(email, password, username, ssid.trim(), registerCode.trim());
      } else {
        await signUp(email, password, username);
      }
    } else {
      await signIn(email, password);
    }

    if (!error) {
      onAuthSuccess();
    }
  };

  const handleMagicLink = async () => {
    setInfo(null);
    clearError();
    if (!email) {
      Alert.alert('Error', 'Ingresá tu email');
      return;
    }
    const { error } = await AuthService.sendMagicLink(email);
    if (error) {
      Alert.alert('Error', error);
    } else {
      setInfo('Te enviamos un enlace mágico. Revisá tu email.');
    }
  };

  const handleResetPassword = async () => {
    setInfo(null);
    clearError();
    if (!email) {
      Alert.alert('Error', 'Ingresá tu email');
      return;
    }
    const { error } = await AuthService.resetPassword(email);
    if (error) {
      Alert.alert('Error', error);
    } else {
      setInfo('Enviamos un email para restablecer la contraseña. Revisá tu bandeja.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.appHeader}>
        <Text style={styles.brandText}>WiFi Emergencia</Text>
      </View>
      <View style={styles.content}>
        <StepProgress steps={["Usuario", "Suscripción", "Red"]} currentStep={computeCurrentStep(doneSteps)} doneSteps={doneSteps} />
        <Text style={styles.title}>WiFi Emergencia</Text>
        <Text style={styles.subtitle}>
          {isSignUp ? 'Crear tu cuenta' : 'Iniciar sesión en tu cuenta'}
        </Text>
        {isSignUp && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Precaución</Text>
            <Text style={styles.warningText}>
              Para usar WiFi Emergencia es necesario brindar la SSID de tu red doméstica y su contraseña. Estos datos se almacenan y se utilizan conforme a acuerdos y políticas del servicio.
            </Text>
            <Text style={styles.warningText}>
              Nunca se comparten con terceros y siempre permanecen ocultos y encriptados.
            </Text>
          </View>
        )}
        {isSignUp && (
          <Text style={styles.infoText}>
            Para usar la app es obligatorio cargar tu red. Elegí “Cargar mi red” si vas a crearla ahora o “SSID registrada” si ya tenés un código.
          </Text>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
        {info && <Text style={styles.infoText}>{info}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          editable={!isLoading}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        {isSignUp && (
          <TextInput
            style={styles.input}
            placeholder="Usuario"
            value={username}
            onChangeText={setUsername}
            editable={!isLoading}
            autoCapitalize="none"
          />
        )}

        <TextInput
          style={styles.input}
            placeholder="Contraseña"
          value={password}
          onChangeText={setPassword}
          editable={!isLoading}
          secureTextEntry
        />

        {isSignUp && (
          <TextInput
            style={styles.input}
            placeholder="Confirmar contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!isLoading}
            secureTextEntry
          />
        )}

        {isSignUp && (
          <View style={styles.row}>
          <TouchableOpacity
            style={{ flex: 1, borderWidth: 1, borderColor: !isExistingSsid ? '#4CAF50' : '#ddd', borderRadius: 8, padding: 12, marginRight: 8, backgroundColor: '#fff', alignItems: 'center' }}
              onPress={() => setIsExistingSsid(false)}
              disabled={isLoading}
            >
              <Text style={{ color: !isExistingSsid ? '#2e7d32' : '#666', fontSize: 14, fontWeight: '600' }}>Cargar mi red</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, borderWidth: 1, borderColor: isExistingSsid ? '#4CAF50' : '#ddd', borderRadius: 8, padding: 12, backgroundColor: '#fff', alignItems: 'center' }}
              onPress={() => setIsExistingSsid(true)}
              disabled={isLoading}
            >
              <Text style={{ color: isExistingSsid ? '#2e7d32' : '#666', fontSize: 14, fontWeight: '600' }}>SSID registrada</Text>
            </TouchableOpacity>
          </View>
        )}

        {isSignUp && !isExistingSsid && (
          <Text style={styles.infoText}>
            Al finalizar el registro te llevamos a cargar tu red (SSID y contraseña). Este paso es obligatorio.
          </Text>
        )}

        {isSignUp && isExistingSsid && (
          <Text style={styles.infoText}>
            Ingresá la SSID y el código de registro de tu red.
          </Text>
        )}

        {isSignUp && isExistingSsid && (
          <TextInput
            style={styles.input}
            placeholder="SSID registrada"
            value={ssid}
            onChangeText={setSsid}
            editable={!isLoading}
            autoCapitalize="none"
          />
        )}

        {isSignUp && isExistingSsid && (
          <TextInput
            style={styles.input}
            placeholder="Código de registro"
            value={registerCode}
            onChangeText={setRegisterCode}
            editable={!isLoading}
            secureTextEntry
            autoCapitalize="none"
          />
        )}

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isSignUp ? 'Registrarse' : 'Iniciar sesión'}
            </Text>
          )}
        </TouchableOpacity>

        {!isSignUp && (
          <View style={styles.row}>
            <TouchableOpacity onPress={handleMagicLink}>
              <Text style={styles.linkText}>Enviar enlace mágico</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleResetPassword}>
              <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
          <Text style={styles.toggleText}>
            {isSignUp ? '¿Ya tenés cuenta? Iniciar sesión' : '¿No tenés cuenta? Registrate'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  appHeader: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    padding: 24,
    justifyContent: 'center',
    flexGrow: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    color: '#666',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  toggleText: {
    textAlign: 'center',
    color: Colors.primaryDark,
    fontSize: 14,
  },
  errorText: {
    color: '#f44336',
    marginBottom: 16,
    textAlign: 'center',
  },
  infoText: {
    color: '#2e7d32',
    marginBottom: 12,
    textAlign: 'center',
  },
  warningBox: {
    borderWidth: 1,
    borderColor: '#f44336',
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  warningTitle: {
    color: '#c62828',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  warningText: {
    color: '#c62828',
    fontSize: 12,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  linkText: {
    color: Colors.primaryDark,
    fontSize: 14,
  },
});
