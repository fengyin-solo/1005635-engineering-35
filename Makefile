.PHONY: install frontend build bootstrap seed reset-local check-data

install:
	cd frontend && npm install

# 起步一条命令：装依赖（缺锁文件先退回补录）+ 灌种子数据 + 一致性校验
bootstrap:
	cd frontend && npm run bootstrap

# 只灌种子数据（幂等，断了重跑会接着走）
seed:
	cd frontend && npm run seed:data

# 回收入口：仅本地环境复位，各模块待处理数归位，重复提交只记一次
reset-local:
	cd frontend && npm run reset:local

# 一致性检查：概览总量必须等于各模块之和
check-data:
	cd frontend && npm run check:data

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build
