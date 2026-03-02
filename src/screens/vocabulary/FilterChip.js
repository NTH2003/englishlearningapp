import React from "react"
import {TouchableOpacity, Text, StyleSheet} from "react-native"
import {COLORS} from "../../constants"

const FilterChip = ({label, active, onPress}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        active && styles.chipActive,
      ]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    backgroundColor: COLORS.BACKGROUND_WHITE,
  },
  chipActive: {
    borderColor: COLORS.PRIMARY_DARK,
    backgroundColor: COLORS.PRIMARY_DARK + "10",
  },
  chipText: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: "500",
  },
  chipTextActive: {
    color: COLORS.PRIMARY_DARK,
    fontWeight: "700",
  },
})

export default FilterChip

