import { router } from 'expo-router';

import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TransactionForm } from '../../components/TransactionForm';

export default function AddTransactionScreen() {
  return (
    <Screen>
      <ScreenHeader title="ثبت تراکنش" subtitle="نوع، مبلغ و دسته‌بندی را مشخص کن" />
      <TransactionForm mode="create" onSaved={() => router.navigate('/')} />
    </Screen>
  );
}
