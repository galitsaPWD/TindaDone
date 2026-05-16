import { Link, Stack } from 'expo-router';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { Theme } from '../constants/Theme';
import { AlertCircle } from 'lucide-react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Route Error', headerShown: false }} />
      <View style={styles.container}>
        <View style={styles.iconBox}>
          <AlertCircle size={64} color={Theme.colors.primary} strokeWidth={1.5} />
        </View>
        <Text style={styles.title}>Route Lost</Text>
        <Text style={styles.subtitle}>This boutique section is currently unavailable or doesn't exist.</Text>

        <Link href="/" asChild>
          <TouchableOpacity style={styles.btn}>
            <Text style={styles.btnText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconBox: {
    marginBottom: 32,
    opacity: 0.8,
  },
  title: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 32,
    color: Theme.colors.onSurface,
    marginBottom: 12,
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 16,
    color: Theme.colors.outline,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  btn: {
    backgroundColor: Theme.colors.primary,
    height: 60,
    paddingHorizontal: 32,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  btnText: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 16,
    color: '#FFF',
    letterSpacing: 0.5,
  },
});
