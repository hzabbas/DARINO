import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { fonts, radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBox({ value, onChange, placeholder = 'جستجو…' }: SearchBoxProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Ionicons name="search-outline" size={18} color={colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.primary}
        style={styles.input}
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityLabel="پاک کردن جستجو">
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    color: colors.text,
    textAlign: 'right',
    paddingVertical: 0,
  },
});
