.PHONY: install setup reset-local frontend build

install: setup

# 一条命令起步：拉齐依赖 + 灌好种子数据（可重复执行、中断可续跑）
setup:
	./setup.sh

# 本地环境复位：仅本地有效，页面刷新后各模块回到种子待处理清单
reset-local:
	./reset-local.sh

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build
