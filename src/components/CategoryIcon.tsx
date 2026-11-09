import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface CategoryIconProps {
  icon: string;
  color: string;
  size?: number;
}

/** دایره‌ی رنگی و آیکون دسته‌بندی؛ همه‌جا یک شکل ثابت دارد. */
export function CategoryIcon({ icon, color, size = 42 }: CategoryIconProps) {
  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${color}1F`,
        },
      ]}>
      <Ionicons name={icon as IoniconName} size={size * 0.5} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
