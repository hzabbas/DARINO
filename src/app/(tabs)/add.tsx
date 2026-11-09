import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TransactionForm } from '../../components/TransactionForm';

export default function AddTransactionScreen() {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <ScreenHeader title="ثبت تراکنش" subtitle="نوع، مبلغ و دسته‌بندی را مشخص کن" />
        <TransactionForm mode="create" onSaved={() => router.navigate('/')} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
