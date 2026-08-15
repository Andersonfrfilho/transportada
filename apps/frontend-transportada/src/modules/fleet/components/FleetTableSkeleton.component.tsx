/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import styles from '../styles/fleet.module.css'

const SKELETON_ROW_COUNT = 4
const FIRST_COLUMN_WIDTH = '70%'
const COLUMN_WIDTH = '50%'

type FleetTableSkeletonProps = Readonly<{
  columnCount: number
  label: string
}>

export function FleetTableSkeleton({ columnCount, label }: FleetTableSkeletonProps) {
  return (
    <SkeletonGroup className={styles.skeletonTable} label={label}>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <div className={styles.skeletonRow} key={rowIndex}>
          {Array.from({ length: columnCount }, (_, columnIndex) => (
            <Skeleton
              key={columnIndex}
              variant="text"
              width={columnIndex === 0 ? FIRST_COLUMN_WIDTH : COLUMN_WIDTH}
            />
          ))}
        </div>
      ))}
    </SkeletonGroup>
  )
}
